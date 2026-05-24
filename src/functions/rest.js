import { SupabaseStore } from '../lib/supabase_store.js';
import { ensureMigrations } from '../lib/migrations.js';

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
      await store.patch('characters', c.id, {
        current_hp: c.max_hp,
        temporary_hp: 0,
        spell_slots_usable: c.spell_slots_total ?? {},
        conditions: [],
      });
      const parts = [`${c.name}: HP restored to ${c.max_hp}`];
      const totalSlots = Object.values(c.spell_slots_total ?? {}).reduce((a, b) => a + b, 0);
      if (totalSlots > 0) parts.push(`all spell slots restored`);
      if (c.temporary_hp > 0) parts.push(`${c.temporary_hp} temp HP cleared`);
      const activeConditions = c.conditions ?? [];
      if (activeConditions.length > 0) parts.push(`conditions cleared (${activeConditions.join(', ')})`);
      results.push(parts.join(', ') + '.');
    }
    return `Long rest complete.\n${results.join('\n')}`;
  }

  // Short rest: only Warlocks (Pact Magic recharges on a short rest)
  for (const c of characters) {
    const isWarlock = c.class_name?.toLowerCase().includes('warlock');
    if (isWarlock) {
      const totalSlots = Object.values(c.spell_slots_total ?? {}).reduce((a, b) => a + b, 0);
      await store.patch('characters', c.id, { spell_slots_usable: c.spell_slots_total ?? {} });
      results.push(`${c.name}: Pact Magic restored (${totalSlots} slot${totalSlots !== 1 ? 's' : ''}).`);
    } else {
      results.push(`${c.name}: no automated changes (spend Hit Dice to recover HP).`);
    }
  }
  return `Short rest complete.\n${results.join('\n')}`;
}
