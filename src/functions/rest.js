import { SupabaseStore } from '../lib/supabase_store.js';
import { ensureMigrations } from '../lib/migrations.js';

const DICE_PATTERN = /^\d+d\d+/i;

function recoverResources(resources, frequencies) {
  const recovered = [];
  const needsRoll = [];
  const updated = resources.map(r => {
    if (!frequencies.includes(r.recovery_frequency)) return r;
    if (r.current >= r.max) return r;
    if (DICE_PATTERN.test(String(r.recovery_amount))) {
      needsRoll.push(r);
      return r;
    }
    const amount = r.recovery_amount === 'full' ? r.max : (parseInt(r.recovery_amount, 10) || r.max);
    const newCurrent = Math.min(r.max, r.current + amount);
    if (newCurrent !== r.current) recovered.push({ name: r.name, gained: newCurrent - r.current, newCurrent, max: r.max });
    return { ...r, current: newCurrent };
  });
  return { updated, recovered, needsRoll };
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
      const { updated: updatedResources, recovered, needsRoll } = recoverResources(
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
      if (recovered.length > 0) parts.push(`resources restored: ${recovered.map(r => `${r.name} (${r.newCurrent}/${r.max})`).join(', ')}`);
      if (needsRoll.length > 0) parts.push(`resources needing manual roll: ${needsRoll.map(r => `${r.name} (${r.recovery_amount})`).join(', ')}`);
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

    const { updated: updatedResources, recovered, needsRoll } = recoverResources(
      c.resources ?? [], ['short_rest']
    );
    if (recovered.length > 0 || needsRoll.length > 0) patch.resources = updatedResources;
    if (recovered.length > 0) parts.push(`resources restored: ${recovered.map(r => `${r.name} (${r.newCurrent}/${r.max})`).join(', ')}`);
    if (needsRoll.length > 0) parts.push(`resources needing manual roll: ${needsRoll.map(r => `${r.name} (${r.recovery_amount})`).join(', ')}`);

    if (Object.keys(patch).length > 0) await store.patch('characters', c.id, patch);

    if (parts.length === 0) parts.push('no automated changes (spend Hit Dice to recover HP)');
    results.push(`${c.name}: ${parts.join(', ')}.`);
  }
  return `Short rest complete.\n${results.join('\n')}`;
}
