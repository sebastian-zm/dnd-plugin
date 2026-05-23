import { SupabaseStore } from '../lib/supabase_store.js';

export default async function list_memories(params, userSettings) {
  const { game } = params;
  const store = new SupabaseStore(userSettings.externalDbUrl, userSettings.externalDbKey);

  let memories;
  try {
    memories = await store.list('game_memories', { game_slug: game });
  } catch (err) {
    if (err.code === '42P01' || err.code === '42703') {
      return `Schema error: ${err.message}. Please call dnd5e24_run_migrations then retry.`;
    }
    throw err;
  }

  if (memories.length === 0) {
    return `No memories found for game "${game}".`;
  }

  return JSON.stringify(memories.map(m => ({
    id: m.id,
    slug: m.slug,
    name: m.name,
    memory: m.memory,
  })));
}
