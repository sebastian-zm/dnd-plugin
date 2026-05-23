import { SupabaseStore } from '../lib/supabase_store.js';

export default async function delete_memory(params, userSettings) {
  const { game, slug } = params;
  const store = new SupabaseStore(userSettings.externalDbUrl, userSettings.externalDbKey);

  try {
    const existing = await store.get('game_memories', slug, game);
    if (!existing) {
      return `No memory with slug "${slug}" found in game "${game}".`;
    }
    await store.delete('game_memories', existing.id);
    return `Memory "${existing.name}" (${slug}) deleted from game "${game}".`;
  } catch (err) {
    if (err.code === '42P01' || err.code === '42703') {
      return `Schema error: ${err.message}. Please call dnd5e24_run_migrations then retry.`;
    }
    throw err;
  }
}
