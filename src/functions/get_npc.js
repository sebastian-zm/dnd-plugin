import { SupabaseStore } from '../lib/supabase_store.js';
import { ensureMigrations } from '../lib/migrations.js';
import { decorateNpc } from '../lib/derived.js';

export default async function get_npc(params, userSettings) {
  await ensureMigrations(userSettings);

  const { game, npc } = params;
  const store = new SupabaseStore(userSettings.externalDbUrl, userSettings.externalDbKey);
  const record = await store.get('npcs', npc, game);

  if (!record || record.game_slug !== game) {
    return `No NPC found with identifier "${npc}" in game "${game}".`;
  }

  return JSON.stringify(decorateNpc(record));
}
