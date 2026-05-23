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

  async upsert(table, record) {
    const res = await fetch(`${this.url}/rest/v1/${table}`, {
      method: 'POST',
      headers: { ...this.#headers, 'Prefer': 'resolution=merge-duplicates,return=representation' },
      body: JSON.stringify(record),
    });
    if (!res.ok) throw new Error(`Supabase upsert failed: ${await res.text()}`);
    const data = await res.json();
    return data[0];
  }

  async get(table, id) {
    const res = await fetch(`${this.url}/rest/v1/${table}?id=eq.${id}&limit=1`, {
      headers: this.#headers,
    });
    if (!res.ok) throw new Error(`Supabase get failed: ${await res.text()}`);
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
    if (!res.ok) throw new Error(`Supabase list failed: ${await res.text()}`);
    return res.json();
  }

  async delete(table, id) {
    const res = await fetch(`${this.url}/rest/v1/${table}?id=eq.${id}`, {
      method: 'DELETE',
      headers: this.#headers,
    });
    if (!res.ok) throw new Error(`Supabase delete failed: ${await res.text()}`);
  }
}
