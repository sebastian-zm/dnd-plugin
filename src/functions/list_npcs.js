import { SupabaseStore } from '../lib/supabase_store.js';
import { ensureMigrations } from '../lib/migrations.js';

export default async function list_npcs(params, userSettings) {
  await ensureMigrations(userSettings);

  const { game, fields } = params;
  const store = new SupabaseStore(userSettings.externalDbUrl, userSettings.externalDbKey);
  const npcs = await store.list('npcs', { game_slug: game });

  if (npcs.length === 0) {
    return `No NPCs found in game "${game}".`;
  }

  const keys = fields ?? ['slug', 'name', 'cr', 'ac', 'current_hp', 'max_hp', 'temporary_hp'];
  return JSON.stringify(npcs.map(n => Object.fromEntries(keys.map(k => [k, n[k]]))));
}
