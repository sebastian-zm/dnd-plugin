import { SupabaseStore } from '../lib/supabase_store.js';

export default async function create_memory(params, userSettings) {
  const { game, slug, name, memory } = params;
  const store = new SupabaseStore(userSettings.externalDbUrl, userSettings.externalDbKey);

  try {
    await store.insert('game_memories', {
      id: crypto.randomUUID(),
      game_slug: game,
      slug,
      name,
      memory,
    });
  } catch (err) {
    if (err.code === '42P01' || err.code === '42703') {
      return `Schema error: ${err.message}. Please call dnd5e24_run_migrations then retry.`;
    }
    if (err.code === '23505') {
      return `A memory with slug "${slug}" already exists in game "${game}". Use dnd5e24_update_memory to modify it.`;
    }
    throw err;
  }

  return `Memory "${name}" (${slug}) created for game "${game}".`;
}
