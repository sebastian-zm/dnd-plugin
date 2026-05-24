import { SupabaseStore } from '../lib/supabase_store.js';
import { ensureMigrations } from '../lib/migrations.js';

export default async function delete_npc(params, userSettings) {
  await ensureMigrations(userSettings);

  const { game, slug } = params;
  const store = new SupabaseStore(userSettings.externalDbUrl, userSettings.externalDbKey);

  const existing = await store.get('npcs', slug, game);
  if (!existing) {
    return `No NPC with slug "${slug}" found in game "${game}".`;
  }

  await store.delete('npcs', existing.id);
  return `NPC "${existing.name}" (${slug}) deleted from game "${game}".`;
}
