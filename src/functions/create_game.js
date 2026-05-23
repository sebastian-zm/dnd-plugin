import { SupabaseStore } from '../lib/supabase_store.js';

export default async function create_game(params, userSettings) {
  const { slug, name, description } = params;

  const store = new SupabaseStore(userSettings.externalDbUrl, userSettings.externalDbKey);
  try {
    await store.insert('games', { id: crypto.randomUUID(), slug, name, description });
  } catch (err) {
    if (err.code === '42P01' || err.code === '42703') {
      return `Schema error: ${err.message}. Please call dnd5e24_run_migrations then retry.`;
    }
    if (err.code === '23505') {
      return `A game with slug "${slug}" already exists.`;
    }
    throw err;
  }

  return `Game "${name}" created with slug "${slug}".`;
}
