import { SupabaseStore } from '../lib/supabase_store.js';
import { ensureMigrations } from '../lib/migrations.js';

export default async function list_characters(params, userSettings) {
  await ensureMigrations(userSettings);

  const { game, fields } = params;
  const store = new SupabaseStore(userSettings.externalDbUrl, userSettings.externalDbKey);

  const gameRecord = await store.get('games', game);
  if (!gameRecord) {
    return `No game found with slug "${game}".`;
  }

  const characters = await store.list('characters', { game_slug: game });

  if (characters.length === 0) {
    return `No characters found in game "${game}".`;
  }

  const keys = fields ?? ['slug', 'name', 'current_hp', 'max_hp', 'temporary_hp', 'ac', 'conditions'];
  return JSON.stringify(characters.map(c => Object.fromEntries(keys.map(k => [k, c[k]]))));
}
