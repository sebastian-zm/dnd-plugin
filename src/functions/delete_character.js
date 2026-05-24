import { SupabaseStore } from '../lib/supabase_store.js';
import { ensureMigrations } from '../lib/migrations.js';

export default async function delete_character(params, userSettings) {
  await ensureMigrations(userSettings);

  const { game, slug } = params;
  const store = new SupabaseStore(userSettings.externalDbUrl, userSettings.externalDbKey);

  const existing = await store.get('characters', slug, game);
  if (!existing) {
    return `No character with slug "${slug}" found in game "${game}".`;
  }

  await store.delete('characters', existing.id);
  return `Character "${existing.name}" (${slug}) deleted from game "${game}".`;
}
