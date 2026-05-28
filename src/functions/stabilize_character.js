import { SupabaseStore } from '../lib/supabase_store.js';
import { ensureMigrations } from '../lib/migrations.js';

const MAX_RETRIES = 5;

export default async function stabilize_character(params, userSettings) {
  await ensureMigrations(userSettings);

  const { game, character } = params;
  const store = new SupabaseStore(userSettings.externalDbUrl, userSettings.externalDbKey);

  const gameRecord = await store.get('games', game);
  if (!gameRecord) {
    return `No game found with slug "${game}".`;
  }

  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    const record = await store.get('characters', character, game);
    if (!record || record.game_slug !== game) {
      return `No character found with identifier "${character}" in game "${game}".`;
    }

    if (record.current_hp > 0) {
      return `${record.name} is at ${record.current_hp} HP and does not need stabilizing.`;
    }

    if (record.death_save_successes === 0 && record.death_save_failures === 0) {
      return `${record.name} is already stable at 0 HP.`;
    }

    const updated = await store.patch('characters', record.id, {
      death_save_successes: 0,
      death_save_failures: 0,
    }, record.updated_at);
    if (updated === null) continue;

    return `${record.name} is stabilized. They remain unconscious at 0 HP but no longer need to make death saving throws.`;
  }

  return `Could not stabilize "${character}" after ${MAX_RETRIES} attempts due to concurrent updates. Please retry.`;
}
