import { SupabaseStore } from '../lib/supabase_store.js';
import { ensureMigrations } from '../lib/migrations.js';

const MAX_RETRIES = 5;

export default async function apply_condition(params, userSettings) {
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
    if (current.includes(condition)) {
      return `${record.name} already has the ${condition} condition.`;
    }

    const updated = await store.patch(table, record.id, { conditions: [...current, condition] }, record.updated_at);
    if (updated === null) continue;

    const all = [...current, condition];
    return `${record.name} is now ${condition}. Active conditions: ${all.join(', ')}.`;
  }

  return `Could not apply condition to "${entity}" after ${MAX_RETRIES} attempts due to concurrent updates. Please retry.`;
}
