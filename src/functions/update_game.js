import { SupabaseStore } from '../lib/supabase_store.js';

export default async function update_game(params, userSettings) {
  const { game, name, description } = params;
  const store = new SupabaseStore(userSettings.externalDbUrl, userSettings.externalDbKey);

  let record;
  try {
    record = await store.get('games', game);
  } catch (err) {
    if (err.code === '42P01' || err.code === '42703') {
      return `Schema error: ${err.message}. Please call dnd5e24_run_migrations then retry.`;
    }
    throw err;
  }

  if (!record) {
    return `No game found with identifier "${game}".`;
  }

  const patch = {};
  if (name !== undefined) patch.name = name;
  if (description !== undefined) patch.description = description;

  if (Object.keys(patch).length === 0) {
    return 'No fields to update.';
  }

  try {
    await store.patch('games', record.id, patch);
  } catch (err) {
    if (err.code === '42P01' || err.code === '42703') {
      return `Schema error: ${err.message}. Please call dnd5e24_run_migrations then retry.`;
    }
    throw err;
  }

  return `Game "${record.name}" updated.`;
}
