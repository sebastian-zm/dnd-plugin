import { SupabaseStore } from '../lib/supabase_store.js';
import { ensureMigrations } from '../lib/migrations.js';

const MAX_RETRIES = 5;

export default async function remove_condition(params, userSettings) {
  await ensureMigrations(userSettings);

  const { game, entity_type, entity, condition } = params;
  const table = entity_type === 'character' ? 'characters' : 'npcs';
  const store = new SupabaseStore(userSettings.externalDbUrl, userSettings.externalDbKey);

  const gameRecord = await store.get('games', game);
  if (!gameRecord) {
    return `No game found with slug "${game}".`;
  }

  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    const record = await store.get(table, entity, game);
    if (!record || record.game_slug !== game) {
      return `No ${entity_type} found with identifier "${entity}" in game "${game}".`;
    }

    const current = record.conditions ?? [];
    if (!current.includes(condition)) {
      return `${record.name} does not have the ${condition} condition.`;
    }

    const remaining = current.filter(c => c !== condition);
    const updated = await store.patch(table, record.id, { conditions: remaining }, record.updated_at);
    if (updated === null) continue;

    if (remaining.length === 0) {
      return `${record.name} is no longer ${condition}. No active conditions.`;
    }
    return `${record.name} is no longer ${condition}. Active conditions: ${remaining.join(', ')}.`;
  }

  return `Could not remove condition from "${entity}" after ${MAX_RETRIES} attempts due to concurrent updates. Please retry.`;
}
