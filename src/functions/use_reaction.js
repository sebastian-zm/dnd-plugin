import { SupabaseStore } from '../lib/supabase_store.js';
import { ensureMigrations } from '../lib/migrations.js';

export default async function use_reaction(params, userSettings) {
  await ensureMigrations(userSettings);

  const { game, entity_type, entity } = params;
  const store = new SupabaseStore(userSettings.externalDbUrl, userSettings.externalDbKey);

  const gameRecord = await store.get('games', game);
  if (!gameRecord) {
    return `No game found with slug "${game}".`;
  }

  if (!gameRecord.combat_active) {
    return `No active combat in "${game}". Reactions are tracked during combat only.`;
  }

  const turnOrder = gameRecord.turn_order ?? [];
  const idx = turnOrder.findIndex(c => c.slug === entity && c.entity_type === entity_type);

  if (idx === -1) {
    return `"${entity}" (${entity_type}) is not in the current combat order.`;
  }

  const combatant = turnOrder[idx];

  if (combatant.reaction_available === false) {
    return `${combatant.name} has already used their reaction this round. It recharges at the start of their next turn.`;
  }

  const updatedTurnOrder = turnOrder.map((c, i) =>
    i === idx ? { ...c, reaction_available: false } : c
  );

  await store.patch('games', gameRecord.id, { turn_order: updatedTurnOrder });

  return `${combatant.name} uses their reaction. It will recharge at the start of their next turn (Round ${gameRecord.combat_round}).`;
}
