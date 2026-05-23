import { SupabaseStore } from '../lib/supabase_store.js';

export default async function list_npcs(params, userSettings) {
  const { game } = params;

  const store = new SupabaseStore(userSettings.externalDbUrl, userSettings.externalDbKey);
  let npcs;
  try {
    npcs = await store.list('npcs', { game_slug: game });
  } catch (err) {
    if (err.code === '42P01' || err.code === '42703') {
      return `Schema error: ${err.message}. Please call dnd5e24_run_migrations then retry.`;
    }
    throw err;
  }

  if (npcs.length === 0) {
    return `No NPCs found in game "${game}".`;
  }

  return JSON.stringify(npcs);
}
