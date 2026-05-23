import { SupabaseStore } from '../lib/supabase_store.js';

export default async function get_npc(params, userSettings) {
  const { game, npc } = params;
  const store = new SupabaseStore(userSettings.externalDbUrl, userSettings.externalDbKey);

  let record;
  try {
    record = await store.get('npcs', npc, game);
  } catch (err) {
    if (err.code === '42P01' || err.code === '42703') {
      return `Schema error: ${err.message}. Please call dnd5e24_run_migrations then retry.`;
    }
    throw err;
  }

  if (!record || record.game_slug !== game) {
    return `No NPC found with identifier "${npc}" in game "${game}".`;
  }

  return JSON.stringify(record);
}
