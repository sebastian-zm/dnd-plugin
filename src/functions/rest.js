import { SupabaseStore } from '../lib/supabase_store.js';
import { ensureMigrations } from '../lib/migrations.js';
import { DiceParser } from '../lib/dice.js';

const DICE_PATTERN = /^\d+d\d+/i;

function getRules(r) {
  if (Array.isArray(r.recovery_rules)) return r.recovery_rules;
  // backward compat: flat fields from old schema
  if (r.recovery_frequency) return [{ amount: r.recovery_amount ?? 'full', frequency: r.recovery_frequency }];
  return [];
}

function resolveAmount(amount, max) {
  if (amount === 'full') return max;
  if (DICE_PATTERN.test(String(amount))) {
    try { return new DiceParser().parse(String(amount)).total; } catch { return 0; }
  }
  return parseInt(amount, 10) || 0;
}

function recoverResources(resources, frequencies) {
  const recovered = [];
  const updated = resources.map(r => {
    const rules = getRules(r);
    const matching = rules.filter(rule => frequencies.includes(rule.frequency));
    if (matching.length === 0 || r.current >= r.max) return r;

    const best = matching.reduce((best, rule) => {
      const val = resolveAmount(rule.amount, r.max);
      return val > best.val ? { val, isDice: DICE_PATTERN.test(String(rule.amount)), expr: rule.amount } : best;
    }, { val: -Infinity, isDice: false, expr: '' });

    if (best.val <= 0) return r;
    const newCurrent = Math.min(r.max, r.current + best.val);
    if (newCurrent !== r.current) {
      const note = best.isDice ? ` (rolled ${best.expr})` : '';
      recovered.push({ name: r.name, gained: newCurrent - r.current, newCurrent, max: r.max, note });
    }
    return { ...r, current: newCurrent };
  });
  return { updated, recovered };
}

export default async function rest(params, userSettings) {
  await ensureMigrations(userSettings);

  const { game, rest_type } = params;
  const store = new SupabaseStore(userSettings.externalDbUrl, userSettings.externalDbKey);

  const gameRecord = await store.get('games', game);
  if (!gameRecord) {
    return `No game found with slug "${game}".`;
  }

  const characters = await store.list('characters', { game_slug: game });
  if (characters.length === 0) {
    return `No characters found in game "${game}".`;
  }

  const results = [];

  if (rest_type === 'long') {
    for (const c of characters) {
      const { updated: updatedResources, recovered } = recoverResources(
        c.resources ?? [], ['short_rest', 'long_rest']
      );
      await store.patch('characters', c.id, {
        current_hp: c.max_hp,
        temporary_hp: 0,
        spell_slots_usable: c.spell_slots_total ?? {},
        conditions: [],
        death_save_successes: 0,
        death_save_failures: 0,
        resources: updatedResources,
      });
      const parts = [`${c.name}: HP restored to ${c.max_hp}`];
      const totalSlots = Object.values(c.spell_slots_total ?? {}).reduce((a, b) => a + b, 0);
      if (totalSlots > 0) parts.push(`all spell slots restored`);
      if (c.temporary_hp > 0) parts.push(`${c.temporary_hp} temp HP cleared`);
      const activeConditions = c.conditions ?? [];
      if (activeConditions.length > 0) parts.push(`conditions cleared (${activeConditions.join(', ')})`);
      if (recovered.length > 0) parts.push(`resources restored: ${recovered.map(r => `${r.name} ${r.newCurrent}/${r.max}${r.note}`).join(', ')}`);
      results.push(parts.join(', ') + '.');
    }
    return `Long rest complete.\n${results.join('\n')}`;
  }

  // Short rest: Warlocks restore Pact Magic; all characters restore short-rest resources
  for (const c of characters) {
    const parts = [];
    const isWarlock = c.class_name?.toLowerCase().includes('warlock');
    const patch = {};

    if (isWarlock) {
      const totalSlots = Object.values(c.spell_slots_total ?? {}).reduce((a, b) => a + b, 0);
      patch.spell_slots_usable = c.spell_slots_total ?? {};
      parts.push(`Pact Magic restored (${totalSlots} slot${totalSlots !== 1 ? 's' : ''})`);
    }

    const { updated: updatedResources, recovered } = recoverResources(
      c.resources ?? [], ['short_rest']
    );
    if (recovered.length > 0) patch.resources = updatedResources;
    if (recovered.length > 0) parts.push(`resources restored: ${recovered.map(r => `${r.name} ${r.newCurrent}/${r.max}${r.note}`).join(', ')}`);

    if (Object.keys(patch).length > 0) await store.patch('characters', c.id, patch);

    if (parts.length === 0) parts.push('no automated changes (spend Hit Dice to recover HP)');
    results.push(`${c.name}: ${parts.join(', ')}.`);
  }
  return `Short rest complete.\n${results.join('\n')}`;
}
