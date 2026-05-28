import { SupabaseStore } from '../lib/supabase_store.js';
import { ensureMigrations } from '../lib/migrations.js';
import { DiceParser } from '../lib/dice.js';

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

  const parser = new DiceParser();
  const initLines = [];

  // Resolve initiative for each combatant, auto-rolling if omitted
  const resolved = [];
  for (const combatant of combatants) {
    if (combatant.initiative != null) {
      resolved.push({ ...combatant, reaction_available: true });
      continue;
    }

    const entityTable = combatant.entity_type === 'character' ? 'characters' : 'npcs';
    const entityRecord = await store.get(entityTable, combatant.slug, game);
    const dex = entityRecord?.dexterity ?? 10;
    const dexMod = Math.floor((dex - 10) / 2);
    const sign = dexMod >= 0 ? `+${dexMod}` : `${dexMod}`;
    const roll = parser.parse(`1d20${sign}`);
    const d20Result = roll.total - dexMod;
    initLines.push(`  ${combatant.name}: 1d20(${d20Result})${sign} = ${roll.total}`);
    resolved.push({ ...combatant, initiative: roll.total, reaction_available: true });
  }

  const sorted = [...resolved].sort((a, b) => b.initiative - a.initiative);

  // Strip display-only fields before storing
  const storageOrder = sorted.map(({ ...c }) => c);

  await store.patch('games', gameRecord.id, {
    combat_active: true,
    combat_round: 1,
    turn_order: storageOrder,
    active_combatant_index: 0,
  });

  const orderLines = sorted.map((c, i) => `  ${i + 1}. ${c.name} (${c.entity_type}) — initiative ${c.initiative}`).join('\n');
  const first = sorted[0];

  const autoRollNote = initLines.length > 0 ? `\nAuto-rolled initiatives:\n${initLines.join('\n')}\n` : '\n';
  return `Combat begins! Round 1.${autoRollNote}\nInitiative order:\n${orderLines}\n\nFirst up: ${first.name} (${first.entity_type}).`;
}
