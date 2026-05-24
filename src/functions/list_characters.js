import { SupabaseStore } from '../lib/supabase_store.js';
import { ensureMigrations } from '../lib/migrations.js';

export default async function list_characters(params, userSettings) {
  await ensureMigrations(userSettings);

  const { game } = params;
  const store = new SupabaseStore(userSettings.externalDbUrl, userSettings.externalDbKey);
  const characters = await store.list('characters', { game_slug: game });

  if (characters.length === 0) {
    return `No characters found in game "${game}".`;
  }

  return JSON.stringify(characters.map(c => ({
    slug: c.slug,
    name: c.name,
    current_hp: c.current_hp,
    max_hp: c.max_hp,
    temporary_hp: c.temporary_hp,
    ac: c.ac,
  })));
}
