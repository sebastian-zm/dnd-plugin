import { SupabaseStore } from '../lib/supabase_store.js';

export default async function update_memory(params, userSettings) {
  const { game, slug, name, memory } = params;
  const store = new SupabaseStore(userSettings.externalDbUrl, userSettings.externalDbKey);

  let record;
  try {
    record = await store.get('game_memories', slug, game);
  } catch (err) {
    if (err.code === '42P01' || err.code === '42703') {
      return `Schema error: ${err.message}. Please call dnd5e24_run_migrations then retry.`;
    }
    throw err;
  }

  if (!record || record.game_slug !== game) {
    return `No memory found with identifier "${slug}" in game "${game}".`;
  }

  const patch = {};
  if (name !== undefined) patch.name = name;
  if (memory !== undefined) patch.memory = memory;

  if (Object.keys(patch).length === 0) {
    return 'No fields to update.';
  }

  try {
    await store.patch('game_memories', record.id, patch);
  } catch (err) {
    if (err.code === '42P01' || err.code === '42703') {
      return `Schema error: ${err.message}. Please call dnd5e24_run_migrations then retry.`;
    }
    throw err;
  }

  return `Memory "${record.name}" (${record.slug}) updated.`;
}
