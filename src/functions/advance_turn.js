import { SupabaseStore } from '../lib/supabase_store.js';
import { ensureMigrations } from '../lib/migrations.js';

export default async function advance_turn(params, userSettings) {
  await ensureMigrations(userSettings);

  const { game } = params;
  const store = new SupabaseStore(userSettings.externalDbUrl, userSettings.externalDbKey);

  const gameRecord = await store.get('games', game);
  if (!gameRecord) {
    return `No game found with slug "${game}".`;
  }

  if (!gameRecord.combat_active) {
    return `No active combat in "${game}". Start one with start_combat.`;
  }

  const turnOrder = gameRecord.turn_order ?? [];
  if (turnOrder.length === 0) {
    return `Turn order is empty. Something went wrong — try end_combat and start_combat again.`;
  }

  const currentIndex = gameRecord.active_combatant_index ?? 0;
  const nextIndex = (currentIndex + 1) % turnOrder.length;
  const newRound = nextIndex === 0 ? gameRecord.combat_round + 1 : gameRecord.combat_round;

  // Recharge reaction for the combatant whose turn is now starting
  const updatedTurnOrder = turnOrder.map((c, i) =>
    i === nextIndex ? { ...c, reaction_available: true } : c
  );

  await store.patch('games', gameRecord.id, {
    active_combatant_index: nextIndex,
    combat_round: newRound,
    turn_order: updatedTurnOrder,
  });

  const current = turnOrder[currentIndex];
  const next = updatedTurnOrder[nextIndex];
  const roundNote = nextIndex === 0 ? `\n--- Round ${newRound} begins ---` : '';
  return `${current.name} ends their turn.${roundNote}\nNow acting: ${next.name} (${next.entity_type}) — Round ${newRound}, position ${nextIndex + 1}/${turnOrder.length}.`;
}
