import { SupabaseStore } from '../lib/supabase_store.js';
import { ensureMigrations } from '../lib/migrations.js';

const MAX_RETRIES = 5;

export default async function set_concentration(params, userSettings) {
  await ensureMigrations(userSettings);

  const { game, entity_type, entity, spell } = params;
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

    const concentration = {
      spell,
      started_round: gameRecord.combat_round ?? 0,
    };

    const previous = record.concentration;
    const updated = await store.patch(table, record.id, { concentration }, record.updated_at);
    if (updated === null) continue;

    const prevNote = previous ? ` (broke concentration on ${previous.spell})` : '';
    return `${record.name} is now concentrating on ${spell}${prevNote}.`;
  }

  return `Could not set concentration for "${entity}" after ${MAX_RETRIES} attempts due to concurrent updates. Please retry.`;
}
