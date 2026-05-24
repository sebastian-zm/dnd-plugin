import { SupabaseStore } from '../lib/supabase_store.js';
import { ensureMigrations } from '../lib/migrations.js';

export default async function list_npcs(params, userSettings) {
  await ensureMigrations(userSettings);

  const { game } = params;
  const store = new SupabaseStore(userSettings.externalDbUrl, userSettings.externalDbKey);
  const npcs = await store.list('npcs', { game_slug: game });

  if (npcs.length === 0) {
    return `No NPCs found in game "${game}".`;
  }

  return JSON.stringify(npcs.map(n => ({
    slug: n.slug,
    name: n.name,
    cr: n.cr,
    ac: n.ac,
    current_hp: n.current_hp,
    max_hp: n.max_hp,
    temporary_hp: n.temporary_hp,
  })));
}
