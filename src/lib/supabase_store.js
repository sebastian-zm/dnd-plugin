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

  async list(table, filters = {}) {
    const query = Object.entries(filters)
      .map(([k, v]) => `${k}=eq.${encodeURIComponent(v)}`)
      .join('&');
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

  async deleteWhere(table, filters = {}) {
    const query = Object.entries(filters)
      .map(([k, v]) => `${k}=eq.${encodeURIComponent(v)}`)
      .join('&');
    if (!query) throw new Error('deleteWhere requires at least one filter');
    const res = await fetch(`${this.url}/rest/v1/${table}?${query}`, {
      method: 'DELETE',
      headers: this.#headers,
    });
    await this.#checkResponse(res, `deleteWhere ${table}`);
  }
}
