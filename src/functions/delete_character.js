import { SupabaseStore } from '../lib/supabase_store.js';

export default async function delete_character(params, userSettings) {
  const { game, slug } = params;
  const store = new SupabaseStore(userSettings.externalDbUrl, userSettings.externalDbKey);

  try {
    const existing = await store.get('characters', slug, game);
    if (!existing) {
      return `No character with slug "${slug}" found in game "${game}".`;
    }

    await store.delete('characters', existing.id);
    return `Character "${existing.name}" (${slug}) deleted from game "${game}".`;
  } catch (err) {
    if (err.code === '42P01' || err.code === '42703') {
      return `Schema error: ${err.message}. Please call dnd5e24_run_migrations then retry.`;
    }
    throw err;
  }
}
