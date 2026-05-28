import { SupabaseStore } from '../lib/supabase_store.js';
import { ensureMigrations } from '../lib/migrations.js';
import { DiceParser } from '../lib/dice.js';

const ABILITY_COLUMNS = {
  'Strength': 'strength',
  'Dexterity': 'dexterity',
  'Constitution': 'constitution',
  'Intelligence': 'intelligence',
  'Wisdom': 'wisdom',
  'Charisma': 'charisma',
};

export default async function roll_saves(params, userSettings) {
  await ensureMigrations(userSettings);

  const { game, dc, ability, entities } = params;
  const store = new SupabaseStore(userSettings.externalDbUrl, userSettings.externalDbKey);
  const parser = new DiceParser();

  const gameRecord = await store.get('games', game);
  if (!gameRecord) {
    return `No game found with slug "${game}".`;
  }

  const abilityColumn = ABILITY_COLUMNS[ability];
  const lines = [`${ability} saving throws (DC ${dc}):`];

  for (const ent of entities) {
    const table = ent.entity_type === 'character' ? 'characters' : 'npcs';
    const record = await store.get(table, ent.entity, game);

    if (!record || record.game_slug !== game) {
      lines.push(`  ${ent.entity}: not found`);
      continue;
    }

    const abilityScore = record[abilityColumn] ?? 10;
    const abilityMod = Math.floor((abilityScore - 10) / 2);
    const pb = record.pb ?? 0;

    const proficiencies = record.proficiencies ?? [];
    const isProficient = proficiencies.some(
      p => p.toLowerCase() === `${ability.toLowerCase()} saving throws`
    );

    const bonus = abilityMod + (isProficient ? pb : 0);
    const signedBonus = bonus >= 0 ? `+${bonus}` : `${bonus}`;
    const roll = parser.parse(`1d20${signedBonus}`);
    const d20Result = roll.total - bonus;
    const passed = roll.total >= dc;

    const profNote = isProficient ? ' (prof)' : '';
    const outcome = passed ? 'PASS' : 'FAIL';
    lines.push(`  ${record.name} (${ent.entity_type}): d20=${d20Result}${signedBonus}${profNote} = ${roll.total} — ${outcome}`);
  }

  return lines.join('\n');
}
