export class SupabaseStore {
  constructor(url, key) {
    this.url = url;
    this.key = key;
  }

  get #headers() {
    return {
      'apikey': this.key,
      'Authorization': `Bearer ${this.key}`,
      'Content-Type': 'application/json',
    };
  }

  #throwError(context, body) {
    const detail = body.detail ? ` Detail: ${body.detail}` : '';
    const err = new Error(`${context}: ${body.message ?? JSON.stringify(body)}${detail}`);
    err.code = body.code;
    throw err;
  }

  async #checkResponse(res, context) {
    if (!res.ok) {
      const body = await res.json().catch(() => ({ message: res.statusText }));
      this.#throwError(context, body);
    }
  }

  async insert(table, record) {
    const res = await fetch(`${this.url}/rest/v1/${table}`, {
      method: 'POST',
      headers: { ...this.#headers, 'Prefer': 'return=representation' },
      body: JSON.stringify(record),
    });
    await this.#checkResponse(res, `insert ${table}`);
    const data = await res.json();
    return data[0];
  }

  async upsert(table, record) {
    const res = await fetch(`${this.url}/rest/v1/${table}`, {
      method: 'POST',
      headers: { ...this.#headers, 'Prefer': 'resolution=merge-duplicates,return=representation' },
      body: JSON.stringify(record),
    });
    await this.#checkResponse(res, `upsert ${table}`);
    const data = await res.json();
    return data[0];
  }

  async get(table, idOrSlug, gameSlug) {
    const isUuid = /^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i.test(idOrSlug);
    let url = `${this.url}/rest/v1/${table}?`;
    if (isUuid) {
      url += `id=eq.${idOrSlug}`;
    } else {
      url += `slug=eq.${encodeURIComponent(idOrSlug)}`;
      if (gameSlug) url += `&game_slug=eq.${encodeURIComponent(gameSlug)}`;
    }
    url += '&limit=1';
    const res = await fetch(url, { headers: this.#headers });
    await this.#checkResponse(res, `get ${table}`);
    const data = await res.json();
    return data[0] ?? null;
  }

  async list(table, filters = {}, options = {}) {
    const params = Object.entries(filters).map(([k, v]) => `${k}=eq.${encodeURIComponent(v)}`);
    if (options.order) params.push(`order=${encodeURIComponent(options.order)}`);
    if (options.limit) params.push(`limit=${options.limit}`);
    const query = params.join('&');
    const res = await fetch(`${this.url}/rest/v1/${table}${query ? `?${query}` : ''}`, {
      headers: this.#headers,
    });
    await this.#checkResponse(res, `list ${table}`);
    return res.json();
  }

  async patch(table, id, changes, updatedAt) {
    const body = { ...changes, updated_at: new Date().toISOString() };
    let url = `${this.url}/rest/v1/${table}?id=eq.${encodeURIComponent(id)}`;
    if (updatedAt !== undefined) {
      url += `&updated_at=eq.${encodeURIComponent(updatedAt)}`;
    }
    const res = await fetch(url, {
      method: 'PATCH',
      headers: { ...this.#headers, 'Prefer': 'return=representation' },
      body: JSON.stringify(body),
    });
    await this.#checkResponse(res, `patch ${table}`);
    const data = await res.json();
    // When updatedAt is supplied, 0 rows means a concurrent write landed first — return null so callers can retry.
    return updatedAt !== undefined ? (data[0] ?? null) : data[0];
  }

  async delete(table, id) {
    const res = await fetch(`${this.url}/rest/v1/${table}?id=eq.${encodeURIComponent(id)}`, {
      method: 'DELETE',
      headers: this.#headers,
    });
    await this.#checkResponse(res, `delete ${table}`);
  }

  // Delete every row matching the given filters.
  // A filter value may be a scalar (matched with `eq`) or an operator object
  // `{ op, value }` to use any PostgREST operator (e.g. `{ op: 'lte', value: 5 }`).
  // Pass `{ returning: true }` to return the deleted rows as representation.
  async deleteWhere(table, filters = {}, options = {}) {
    const conditions = Object.entries(filters).map(([k, v]) => {
      if (v !== null && typeof v === 'object' && 'op' in v) {
        const value = v.value === null ? 'null' : encodeURIComponent(v.value);
        return `${k}=${v.op}.${value}`;
      }
      return `${k}=eq.${encodeURIComponent(v)}`;
    });
    if (conditions.length === 0) throw new Error('deleteWhere requires at least one filter');
    const headers = options.returning
      ? { ...this.#headers, 'Prefer': 'return=representation' }
      : this.#headers;
    const res = await fetch(`${this.url}/rest/v1/${table}?${conditions.join('&')}`, {
      method: 'DELETE',
      headers,
    });
    await this.#checkResponse(res, `deleteWhere ${table}`);
    if (options.returning) return res.json();
  }
}
