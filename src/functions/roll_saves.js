import { SupabaseStore } from '../lib/supabase_store.js';
import { ensureMigrations } from '../lib/migrations.js';
import { DiceParser } from '../lib/dice.js';
import { loadEffectsForEntity, collectModifiers } from '../lib/effects.js';

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

    // Check active effects for advantage/disadvantage and bonus dice (Bless, Bane, etc.).
    const effects = await loadEffectsForEntity(store, game, ent.entity_type, ent.entity);
    const mods = collectModifiers(effects, 'save', { ability });

    // Roll d20, respecting advantage/disadvantage.
    const r1 = Math.floor(Math.random() * 20) + 1;
    let d20Result, d20Display;
    if (mods.advantageState !== 'normal') {
      const r2 = Math.floor(Math.random() * 20) + 1;
      d20Result = mods.advantageState === 'advantage' ? Math.max(r1, r2) : Math.min(r1, r2);
      d20Display = `${r1},${r2}->${d20Result}(${mods.advantageState === 'advantage' ? 'adv' : 'dis'})`;
    } else {
      d20Result = r1;
      d20Display = `${r1}`;
    }

    let total = d20Result + bonus;
    let effectStr = '';
    for (const bd of mods.bonusDice) {
      const r = parser.parse(bd.dice);
      const val = bd.negate ? -r.total : r.total;
      total += val;
      effectStr += `${bd.negate ? '-' : '+'}${r.total}(${bd.source})`;
    }
    if (mods.flatBonus !== 0) {
      total += mods.flatBonus;
      effectStr += `${mods.flatBonus >= 0 ? '+' : ''}${mods.flatBonus}(effect)`;
    }

    const passed = total >= dc;
    const profNote = isProficient ? ' (prof)' : '';
    const outcome = passed ? 'PASS' : 'FAIL';
    lines.push(`  ${record.name} (${ent.entity_type}): d20=${d20Display}${signedBonus}${profNote}${effectStr} = ${total} — ${outcome}`);
  }

  return lines.join('\n');
}
