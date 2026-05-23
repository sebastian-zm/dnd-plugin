import { SupabaseStore } from '../lib/supabase_store.js';

export default async function get_character(params, userSettings) {
  const { game, character } = params;
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

  return JSON.stringify(record);
}
