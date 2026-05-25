import { SupabaseStore } from '../lib/supabase_store.js';
import { ensureMigrations } from '../lib/migrations.js';

const MAX_RETRIES = 5;

export default async function roll_death_save(params, userSettings) {
  await ensureMigrations(userSettings);

  const { game, character, outcome } = params;
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
      return `${record.name} is not at 0 HP and does not need to make death saving throws.`;
    }

    // Natural 20: regain 1 HP, stabilize, clear saves
    if (outcome === 'critical_success') {
      const updated = await store.patch('characters', record.id, {
        current_hp: 1,
        death_save_successes: 0,
        death_save_failures: 0,
      }, record.updated_at);
      if (updated === null) continue;
      return `${record.name} rolls a natural 20! They regain 1 HP and regain consciousness. Death saves cleared.`;
    }

    const failures = (record.death_save_failures ?? 0) + (outcome === 'critical_failure' ? 2 : outcome === 'failure' ? 1 : 0);
    const successes = (record.death_save_successes ?? 0) + (outcome === 'success' ? 1 : 0);

    if (failures >= 3) {
      const updated = await store.patch('characters', record.id, {
        death_save_successes: 0,
        death_save_failures: 0,
      }, record.updated_at);
      if (updated === null) continue;
      const failCount = outcome === 'critical_failure' ? 'two failures (natural 1)' : 'a failure';
      return `${record.name} suffers ${failCount}. That's ${Math.min(failures, 3)} failures total — ${record.name} has died.`;
    }

    if (successes >= 3) {
      const updated = await store.patch('characters', record.id, {
        death_save_successes: 0,
        death_save_failures: 0,
      }, record.updated_at);
      if (updated === null) continue;
      return `${record.name} succeeds on their third death save and stabilizes. They remain unconscious at 0 HP. Death saves cleared.`;
    }

    const updated = await store.patch('characters', record.id, {
      death_save_successes: successes,
      death_save_failures: Math.min(failures, 3),
    }, record.updated_at);
    if (updated === null) continue;

    const outcomeDesc = outcome === 'critical_failure'
      ? 'natural 1 — two failures'
      : outcome === 'failure' ? 'failure' : 'success';
    return `${record.name}: death save ${outcomeDesc}. Successes: ${successes}/3, Failures: ${Math.min(failures, 3)}/3.`;
  }

  return `Could not record death save for "${character}" after ${MAX_RETRIES} attempts due to concurrent updates. Please retry.`;
}
