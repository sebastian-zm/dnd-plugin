import { SupabaseStore } from '../lib/supabase_store.js';
import { ensureMigrations } from '../lib/migrations.js';

export default async function create_game(params, userSettings) {
  await ensureMigrations(userSettings);

  const { slug, name, description } = params;
  const store = new SupabaseStore(userSettings.externalDbUrl, userSettings.externalDbKey);

  try {
    await store.insert('games', { id: crypto.randomUUID(), slug, name, description });
  } catch (err) {
    if (err.code === '23505') {
      return `A game with slug "${slug}" already exists.`;
    }
    throw err;
  }

  return `Game "${name}" created with slug "${slug}".`;
}
