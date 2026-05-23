import { SupabaseStore } from '../lib/supabase_store.js';

const IMMUTABLE = new Set(['id', 'game_slug', 'slug']);

export default async function update_character(params, userSettings) {
  const { game, character, ...rest } = params;
  const store = new SupabaseStore(userSettings.externalDbUrl, userSettings.externalDbKey);

  let record;
  try {
    record = await store.get('characters', character, game);
  } catch (err) {
    if (err.code === '42P01' || err.code === '42703') {
      return `Schema error: ${err.message}. Please call dnd5e24_run_migrations then retry.`;
    }
    throw err;
  }

  if (!record || record.game_slug !== game) {
    return `No character found with identifier "${character}" in game "${game}".`;
  }

  const patch = Object.fromEntries(
    Object.entries(rest).filter(([k, v]) => !IMMUTABLE.has(k) && v !== undefined)
  );

  if (Object.keys(patch).length === 0) {
    return 'No fields to update.';
  }

  try {
    await store.patch('characters', record.id, patch);
  } catch (err) {
    if (err.code === '42P01' || err.code === '42703') {
      return `Schema error: ${err.message}. Please call dnd5e24_run_migrations then retry.`;
    }
    throw err;
  }

  return `Character "${record.name}" updated.`;
}
