import { SupabaseStore } from '../lib/supabase_store.js';
import { ensureMigrations } from '../lib/migrations.js';
import { DiceParser } from '../lib/dice.js';
import { elicit } from '../lib/elicit.js';
import { loadEffectsForEntity, collectModifiers } from '../lib/effects.js';

export default async function roll_attack(params, userSettings) {
  await ensureMigrations(userSettings);

  const {
    game,
    attacker_type, attacker,
    target_type, target,
    attack_modifier,
    mode = 'transparent',
    description,
  } = params;

  const store = new SupabaseStore(userSettings.externalDbUrl, userSettings.externalDbKey);
  const parser = new DiceParser();

  const [attackerRecord, targetRecord] = await Promise.all([
    store.get(attacker_type === 'character' ? 'characters' : 'npcs', attacker, game),
    store.get(target_type === 'character' ? 'characters' : 'npcs', target, game),
  ]);

  if (!attackerRecord || attackerRecord.game_slug !== game) {
    return `No ${attacker_type} found with identifier "${attacker}" in game "${game}".`;
  }
  if (!targetRecord || targetRecord.game_slug !== game) {
    return `No ${target_type} found with identifier "${target}" in game "${game}".`;
  }

  const [attackerEffects, targetEffects] = await Promise.all([
    loadEffectsForEntity(store, game, attacker_type, attacker),
    loadEffectsForEntity(store, game, target_type, target),
  ]);

  const attackerMods = collectModifiers(attackerEffects, 'attack');
  const targetMods = collectModifiers(targetEffects, 'attack');

  // D&D rule: any source of advantage and any source of disadvantage cancel each other.
  const hasAdvantage = attackerMods.advantageState === 'advantage' || targetMods.grantAdvantage;
  const hasDisadvantage = attackerMods.advantageState === 'disadvantage';
  const advState =
    (hasAdvantage && hasDisadvantage) ? 'normal' :
    hasAdvantage ? 'advantage' :
    hasDisadvantage ? 'disadvantage' :
    'normal';

  const rollD20 = () => Math.floor(Math.random() * 20) + 1;

  // Roll the d20 (or ask the user for it).
  let d20Result, d20Display;

  if (mode === 'user') {
    const advNote = advState !== 'normal'
      ? ` [${advState}: roll 2d20, take the ${advState === 'advantage' ? 'higher' : 'lower'}]`
      : '';
    const label = description ?? `${attackerRecord.name} attacks ${targetRecord.name}`;
    const { value: input, available } = await elicit(`${label}\nRoll 1d20${advNote} and enter your result:`);

    if (input === null) return 'Roll cancelled.';

    if (!available) {
      // Elicitation not available — fall back to auto-roll.
      const r1 = rollD20();
      if (advState !== 'normal') {
        const r2 = rollD20();
        d20Result = advState === 'advantage' ? Math.max(r1, r2) : Math.min(r1, r2);
        d20Display = `${r1},${r2}->${d20Result}(${advState === 'advantage' ? 'adv' : 'dis'}) [auto]`;
      } else {
        d20Result = r1;
        d20Display = `${r1} [auto]`;
      }
    } else {
      d20Result = parseInt(input, 10) || 1;
      d20Display = `${d20Result}${advState !== 'normal' ? ` (${advState})` : ''} [user]`;
    }
  } else {
    const r1 = rollD20();
    if (advState !== 'normal') {
      const r2 = rollD20();
      d20Result = advState === 'advantage' ? Math.max(r1, r2) : Math.min(r1, r2);
      d20Display = `${r1},${r2}->${d20Result}(${advState === 'advantage' ? 'adv' : 'dis'})`;
    } else {
      d20Result = r1;
      d20Display = `${r1}`;
    }
  }

  // Accumulate total: d20 + static attack modifier + effect dice + effect flat bonus.
  let total = d20Result + attack_modifier;
  const effectParts = [];

  for (const bd of attackerMods.bonusDice) {
    const r = parser.parse(bd.dice);
    const val = bd.negate ? -r.total : r.total;
    total += val;
    const sign = bd.negate ? '-' : '+';
    const autoNote = mode === 'user' ? ' [auto]' : '';
    effectParts.push(`${sign}${r.total} (${bd.source} ${bd.dice})${autoNote}`);
  }

  if (attackerMods.flatBonus !== 0) {
    total += attackerMods.flatBonus;
    effectParts.push(`${attackerMods.flatBonus >= 0 ? '+' : ''}${attackerMods.flatBonus} (effect bonus)`);
  }

  // Determine outcome.
  const isCrit = d20Result === 20;
  const isCritFail = d20Result === 1;
  const targetAC = targetRecord.ac;
  let outcome;
  if (isCrit) outcome = 'CRITICAL HIT!';
  else if (isCritFail) outcome = 'CRITICAL MISS';
  else if (targetAC != null) outcome = total >= targetAC ? 'HIT' : 'MISS';
  else outcome = `${total} vs AC ?`;

  const acStr = targetAC != null ? `AC ${targetAC}` : 'AC ?';
  const modSign = attack_modifier >= 0 ? `+${attack_modifier}` : `${attack_modifier}`;
  const label = description ?? `${attackerRecord.name} -> ${targetRecord.name}`;

  if (mode === 'system') {
    const effectStr = effectParts.length > 0 ? ` ${effectParts.join(' ')}` : '';
    return `${label}: d20(${d20Display})${modSign}${effectStr} = ${total} vs ${acStr} — ${outcome}`;
  }

  // transparent / user: full breakdown.
  const lines = [label];

  if (advState !== 'normal') {
    const advSources = [];
    if (attackerMods.advantageState === 'advantage') advSources.push('attacker buff');
    if (targetMods.grantAdvantage) advSources.push("target's effect");
    if (attackerMods.advantageState === 'disadvantage') advSources.push('attacker debuff');
    lines.push(`${advState.charAt(0).toUpperCase() + advState.slice(1)}: ${advSources.join(', ')}`);
  }

  lines.push(`d20: ${d20Display}`);
  lines.push(`modifier: ${modSign}`);
  for (const part of effectParts) lines.push(part);
  lines.push(`Total: ${total} vs ${acStr} — ${outcome}`);

  return lines.join('\n');
}
