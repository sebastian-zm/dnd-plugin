import { SupabaseStore } from '../lib/supabase_store.js';
import { ensureMigrations } from '../lib/migrations.js';

export default async function list_games(params, userSettings) {
  await ensureMigrations(userSettings);

  const store = new SupabaseStore(userSettings.externalDbUrl, userSettings.externalDbKey);
  const games = await store.list('games');

  if (games.length === 0) {
    return 'No games found.';
  }

  return JSON.stringify(games.map(g => ({ slug: g.slug, name: g.name, description: g.description })));
}
