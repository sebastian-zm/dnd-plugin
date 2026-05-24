import { SupabaseStore } from '../lib/supabase_store.js';
import { ensureMigrations } from '../lib/migrations.js';

export default async function delete_game(params, userSettings) {
  await ensureMigrations(userSettings);

  const { slug } = params;
  const store = new SupabaseStore(userSettings.externalDbUrl, userSettings.externalDbKey);

  const existing = await store.get('games', slug);
  if (!existing) {
    return `No game with slug "${slug}" found.`;
  }

  if (typeof window !== 'undefined') {
    const confirmation = window.prompt(
      `Type the game name to confirm deletion:\n\n"${existing.name}"`
    );
    if (confirmation === null) {
      return 'Deletion cancelled.';
    }
    if (confirmation !== existing.name) {
      return `Deletion cancelled: "${confirmation}" does not match the game name "${existing.name}".`;
    }
  }

  await store.delete('games', existing.id);
  return `Game "${existing.name}" (${slug}) deleted.`;
}
