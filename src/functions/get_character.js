import { SupabaseStore } from '../lib/supabase_store.js';
import { ensureMigrations } from '../lib/migrations.js';
import { decorateCharacter } from '../lib/derived.js';

export default async function get_character(params, userSettings) {
  await ensureMigrations(userSettings);

  const { game, character } = params;
  const store = new SupabaseStore(userSettings.externalDbUrl, userSettings.externalDbKey);
  const record = await store.get('characters', character, game);

  if (!record || record.game_slug !== game) {
    return `No character found with identifier "${character}" in game "${game}".`;
  }

  return JSON.stringify(decorateCharacter(record));
}
