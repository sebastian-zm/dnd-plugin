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

  const summary = npcs.map(n => ({
    slug: n.slug,
    name: n.name,
    cr: n.cr,
    ac: n.ac,
    current_hp: n.current_hp,
    max_hp: n.max_hp,
    temporary_hp: n.temporary_hp,
  }));
  return JSON.stringify(summary);
}
