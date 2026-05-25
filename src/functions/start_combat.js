import { SupabaseStore } from '../lib/supabase_store.js';
import { ensureMigrations } from '../lib/migrations.js';

export default async function start_combat(params, userSettings) {
  await ensureMigrations(userSettings);

  const { game, combatants } = params;
  const store = new SupabaseStore(userSettings.externalDbUrl, userSettings.externalDbKey);

  const gameRecord = await store.get('games', game);
  if (!gameRecord) {
    return `No game found with slug "${game}".`;
  }

  if (gameRecord.combat_active) {
    return `Combat is already active in "${game}" (round ${gameRecord.combat_round}). Call end_combat first to reset.`;
  }

  const sorted = [...combatants].sort((a, b) => b.initiative - a.initiative);

  await store.patch('games', gameRecord.id, {
    combat_active: true,
    combat_round: 1,
    turn_order: sorted,
    active_combatant_index: 0,
  });

  const orderLines = sorted.map((c, i) => `  ${i + 1}. ${c.name} (${c.entity_type}) — initiative ${c.initiative}`).join('\n');
  const first = sorted[0];
  return `Combat begins! Round 1.\nInitiative order:\n${orderLines}\n\nFirst up: ${first.name} (${first.entity_type}).`;
}
