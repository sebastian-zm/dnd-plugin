import { SupabaseStore } from '../lib/supabase_store.js';
import { ensureMigrations } from '../lib/migrations.js';
import { DiceParser, formatTransparent } from '../lib/dice.js';
import { elicit } from '../lib/elicit.js';
import { loadEffectsForEntity, collectModifiers } from '../lib/effects.js';

export default async function roll_damage(params, userSettings) {
  await ensureMigrations(userSettings);

  const {
    game,
    attacker_type, attacker,
    target_type, target,
    base_expression,
    damage_type,
    mode = 'transparent',
    description,
  } = params;

  const store = new SupabaseStore(userSettings.externalDbUrl, userSettings.externalDbKey);
  const parser = new DiceParser();

  const attackerTable = attacker_type === 'character' ? 'characters' : 'npcs';
  const attackerRecord = await store.get(attackerTable, attacker, game);
  if (!attackerRecord || attackerRecord.game_slug !== game) {
    return `No ${attacker_type} found with identifier "${attacker}" in game "${game}".`;
  }

  const attackerEffects = await loadEffectsForEntity(store, game, attacker_type, attacker);
  const mods = collectModifiers(attackerEffects, 'damage');

  const label = description ?? `${attackerRecord.name} damage${damage_type ? ` (${damage_type})` : ''}`;
  const dtLabel = damage_type ? ` ${damage_type}` : '';

  // Build the full expression: base + all effect bonus dice.
  let fullExpr = base_expression;
  const effectDescParts = [];
  for (const bd of mods.bonusDice) {
    const sign = bd.negate ? '-' : '+';
    fullExpr += `${sign}${bd.dice}`;
    const dtNote = bd.damage_type ? ` ${bd.damage_type}` : '';
    effectDescParts.push(`${sign}${bd.dice}${dtNote} (${bd.source})`);
  }
  if (mods.flatBonus !== 0) {
    const sign = mods.flatBonus >= 0 ? '+' : '';
    fullExpr += `${sign}${mods.flatBonus}`;
    effectDescParts.push(`${sign}${mods.flatBonus} (effect bonus)`);
  }

  if (mode === 'system') {
    const result = parser.parse(fullExpr);
    return `${label}: ${result.total}${dtLabel} damage`;
  }

  if (mode === 'transparent') {
    const lines = [label];
    if (effectDescParts.length > 0) lines.push(`Effects: ${effectDescParts.join(', ')}`);
    const result = parser.parse(fullExpr);
    lines.push(formatTransparent(result));
    lines.push(`Total: ${result.total}${dtLabel} damage`);
    return lines.join('\n');
  }

  // user mode: player rolls the base dice, system auto-rolls effect bonus dice.
  const baseGroups = parser.listGroups(base_expression);
  const values = [];
  let elicitAvailable = true;

  for (const groupExpr of baseGroups) {
    const { value: input, available } = await elicit(
      `${label}\nRoll ${groupExpr} and enter your total:`
    );
    if (!available) { elicitAvailable = false; break; }
    if (input === null) return 'Roll cancelled.';
    const val = parseInt(input, 10);
    values.push(isNaN(val) ? 1 : val);
  }

  const lines = [label];
  if (effectDescParts.length > 0) lines.push(`Effects: ${effectDescParts.join(', ')}`);

  if (!elicitAvailable) {
    const result = parser.parse(fullExpr);
    lines.push(formatTransparent(result));
    lines.push('(Auto-rolled: user input not available on this platform.)');
    lines.push(`Total: ${result.total}${dtLabel} damage`);
    return lines.join('\n');
  }

  // Replay the base expression using the user-provided values, then add effect dice.
  let idx = 0;
  const baseResult = parser.parse(base_expression, undefined, (_e) => values[idx++] ?? 1);
  lines.push(`Base: ${formatTransparent(baseResult)}`);

  let effectTotal = mods.flatBonus;
  for (const bd of mods.bonusDice) {
    const r = parser.parse(bd.dice);
    const val = bd.negate ? -r.total : r.total;
    effectTotal += val;
    const sign = bd.negate ? '-' : '+';
    const dtNote = bd.damage_type ? ` ${bd.damage_type}` : '';
    lines.push(`${sign}${r.total} (${bd.source} ${bd.dice}${dtNote}) [auto]`);
  }

  const grandTotal = baseResult.total + effectTotal;
  lines.push(`Total: ${grandTotal}${dtLabel} damage`);
  return lines.join('\n');
}
