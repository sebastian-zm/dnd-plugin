import { SupabaseStore } from '../lib/supabase_store.js';
import { ensureMigrations } from '../lib/migrations.js';

export default async function update_game(params, userSettings) {
  await ensureMigrations(userSettings);

  const { game, name, description } = params;
  const store = new SupabaseStore(userSettings.externalDbUrl, userSettings.externalDbKey);

  const record = await store.get('games', game);
  if (!record) {
    return `No game found with identifier "${game}".`;
  }

  const patch = {};
  if (name !== undefined) patch.name = name;
  if (description !== undefined) patch.description = description;

  if (Object.keys(patch).length === 0) {
    return 'No fields to update.';
  }

  await store.patch('games', record.id, patch);
  return `Game "${record.name}" updated.`;
}
