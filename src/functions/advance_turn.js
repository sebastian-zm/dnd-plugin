import { SupabaseStore } from '../lib/supabase_store.js';
import { ensureMigrations } from '../lib/migrations.js';
import { loadEffectsForEntity, expireEffects } from '../lib/effects.js';

const ABILITY_COLUMNS = {
  Strength: 'strength',
  Dexterity: 'dexterity',
  Constitution: 'constitution',
  Intelligence: 'intelligence',
  Wisdom: 'wisdom',
  Charisma: 'charisma',
};

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

  // --- End-of-turn saves ---
  // For each effect on the ending combatant that has end_on_save, roll the save.
  // Remove the effect on success.
  const endingCombatant = turnOrder[currentIndex];
  const saveLines = [];

  if (endingCombatant?.slug && endingCombatant?.entity_type) {
    const effects = await loadEffectsForEntity(
      store, game, endingCombatant.entity_type, endingCombatant.slug
    );
    const saveEffects = effects.filter(e => e.end_on_save);

    if (saveEffects.length > 0) {
      const table = endingCombatant.entity_type === 'character' ? 'characters' : 'npcs';
      const entityRecord = await store.get(table, endingCombatant.slug, game);

      if (entityRecord) {
        for (const effect of saveEffects) {
          const { dc, ability } = effect.end_on_save;
          const abilityCol = ABILITY_COLUMNS[ability];
          if (!abilityCol) continue;

          const score = entityRecord[abilityCol] ?? 10;
          const mod = Math.floor((score - 10) / 2);
          const pb = entityRecord.pb ?? 0;
          const proficiencies = entityRecord.proficiencies ?? [];
          const isProficient = proficiencies.some(
            p => p.toLowerCase() === `${ability.toLowerCase()} saving throws`
          );
          const bonus = mod + (isProficient ? pb : 0);
          const signedBonus = bonus >= 0 ? `+${bonus}` : `${bonus}`;

          const d20 = Math.floor(Math.random() * 20) + 1;
          const total = d20 + bonus;
          const passed = total >= dc;

          if (passed) {
            await store.delete('active_effects', effect.id);
            saveLines.push(
              `  ${endingCombatant.name} saves vs ${effect.name} (DC ${dc} ${ability}): ${d20}${signedBonus} = ${total} — PASS, effect ended`
            );
          } else {
            saveLines.push(
              `  ${endingCombatant.name} saves vs ${effect.name} (DC ${dc} ${ability}): ${d20}${signedBonus} = ${total} — FAIL`
            );
          }
        }
      }
    }
  }

  // --- Advance turn ---
  // Recharge reaction for the combatant whose turn is now starting.
  const updatedTurnOrder = turnOrder.map((c, i) =>
    i === nextIndex ? { ...c, reaction_available: true } : c
  );

  await store.patch('games', gameRecord.id, {
    active_combatant_index: nextIndex,
    combat_round: newRound,
    turn_order: updatedTurnOrder,
  });

  // --- Duration expiry ---
  // Delete effects whose expires_at_round has been reached by the new round.
  const expired = await expireEffects(userSettings, game, newRound);

  // --- Build output ---
  const current = turnOrder[currentIndex];
  const next = updatedTurnOrder[nextIndex];

  const roundNote = nextIndex === 0 ? `\n--- Round ${newRound} begins ---` : '';
  const saveNote = saveLines.length > 0 ? `\nEnd-of-turn saves:\n${saveLines.join('\n')}` : '';
  const expiredNote = expired.length > 0
    ? `\nExpired: ${expired.map(e => `${e.name} on ${e.target}`).join(', ')}`
    : '';

  return `${current.name} ends their turn.${roundNote}${saveNote}${expiredNote}\nNow acting: ${next.name} (${next.entity_type}) — Round ${newRound}, position ${nextIndex + 1}/${turnOrder.length}.`;
}
