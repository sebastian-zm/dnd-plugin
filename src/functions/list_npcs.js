import { SupabaseStore } from '../lib/supabase_store.js';
import { ensureMigrations } from '../lib/migrations.js';
import { decorateNpc } from '../lib/derived.js';

export default async function list_npcs(params, userSettings) {
  await ensureMigrations(userSettings);

  const { game, fields } = params;
  const store = new SupabaseStore(userSettings.externalDbUrl, userSettings.externalDbKey);

  const gameRecord = await store.get('games', game);
  if (!gameRecord) {
    return `No game found with slug "${game}".`;
  }

  const npcs = await store.list('npcs', { game_slug: game });

  if (npcs.length === 0) {
    return `No NPCs found in game "${game}".`;
  }

  const decorated = npcs.map(decorateNpc);
  const keys = fields ?? ['slug', 'name', 'cr', 'ac', 'current_hp', 'max_hp', 'temporary_hp', 'conditions', 'derived'];
  return JSON.stringify(decorated.map(n => Object.fromEntries(keys.map(k => [k, n[k]]))));
}
