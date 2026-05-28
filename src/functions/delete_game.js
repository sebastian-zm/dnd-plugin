import { SupabaseStore } from '../lib/supabase_store.js';
import { ensureMigrations } from '../lib/migrations.js';
import { elicit } from '../lib/elicit.js';

export default async function delete_game(params, userSettings) {
  await ensureMigrations(userSettings);

  const { slug, confirm_name } = params;
  const store = new SupabaseStore(userSettings.externalDbUrl, userSettings.externalDbKey);

  const existing = await store.get('games', slug);
  if (!existing) {
    return `No game with slug "${slug}" found.`;
  }

  // confirm_name must exactly match the game name — first line of defence against typos
  if (confirm_name !== existing.name) {
    return `Deletion cancelled: "${confirm_name}" does not match the game name "${existing.name}". Pass the exact game name as confirm_name.`;
  }

  // Secondary confirmation via UI dialog when available (TypingMind)
  const { value: confirmation, available } = await elicit(
    `Type the game name to confirm permanent deletion:\n\n"${existing.name}"`
  );
  if (available) {
    if (confirmation === null) return 'Deletion cancelled.';
    if (confirmation !== existing.name) {
      return `Deletion cancelled: "${confirmation}" does not match the game name "${existing.name}".`;
    }
  }

  await Promise.all([
    store.deleteWhere('characters', { game_slug: slug }),
    store.deleteWhere('npcs', { game_slug: slug }),
    store.deleteWhere('game_memories', { game_slug: slug }),
    store.deleteWhere('session_logs', { game_slug: slug }),
  ]);
  await store.delete('games', existing.id);
  return `Game "${existing.name}" (${slug}) deleted.`;
}
