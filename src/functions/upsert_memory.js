import { SupabaseStore } from '../lib/supabase_store.js';

export default async function upsert_memory(params, userSettings) {
  const { game, slug, name, memory } = params;
  const store = new SupabaseStore(userSettings.externalDbUrl, userSettings.externalDbKey);

  try {
    const existing = await store.get('game_memories', slug, game);
    let row;
    if (existing) {
      row = await store.patch('game_memories', existing.id, { name, memory });
    } else {
      row = await store.insert('game_memories', {
        id: crypto.randomUUID(),
        game_slug: game,
        slug,
        name,
        memory,
      });
    }
    return `Memory "${row.name}" (${row.slug}) saved for game "${game}".`;
  } catch (err) {
    if (err.code === '42P01' || err.code === '42703') {
      return `Schema error: ${err.message}. Please call dnd5e24_run_migrations then retry.`;
    }
    throw err;
  }
}
