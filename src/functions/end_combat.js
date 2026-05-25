import { SupabaseStore } from '../lib/supabase_store.js';
import { ensureMigrations } from '../lib/migrations.js';

export default async function end_combat(params, userSettings) {
  await ensureMigrations(userSettings);

  const { game } = params;
  const store = new SupabaseStore(userSettings.externalDbUrl, userSettings.externalDbKey);

  const gameRecord = await store.get('games', game);
  if (!gameRecord) {
    return `No game found with slug "${game}".`;
  }

  if (!gameRecord.combat_active) {
    return `No active combat in "${game}" to end.`;
  }

  const round = gameRecord.combat_round;
  await store.patch('games', gameRecord.id, {
    combat_active: false,
    combat_round: 0,
    turn_order: [],
    active_combatant_index: 0,
  });

  return `Combat ended after ${round} round${round !== 1 ? 's' : ''}. Initiative order cleared.`;
}
