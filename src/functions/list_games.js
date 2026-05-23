import { SupabaseStore } from '../lib/supabase_store.js';

export default async function list_games(params, userSettings) {
  const store = new SupabaseStore(userSettings.externalDbUrl, userSettings.externalDbKey);
  let games;
  try {
    games = await store.list('games');
  } catch (err) {
    if (err.code === '42P01' || err.code === '42703') {
      return `Schema error: ${err.message}. Please call dnd5e24_run_migrations then retry.`;
    }
    throw err;
  }

  if (games.length === 0) {
    return 'No games found.';
  }

  const summary = games.map(g => ({
    slug: g.slug,
    name: g.name,
    description: g.description,
  }));
  return JSON.stringify(summary);
}
