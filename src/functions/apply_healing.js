import { SupabaseStore } from '../lib/supabase_store.js';

export default async function apply_healing(params, userSettings) {
  const { game, entity_type, entity, amount, temporary } = params;

  const table = entity_type === 'character' ? 'characters' : 'npcs';
  const store = new SupabaseStore(userSettings.externalDbUrl, userSettings.externalDbKey);

  let record;
  try {
    record = await store.get(table, entity, game);
  } catch (err) {
    if (err.code === '42P01' || err.code === '42703') {
      return `Schema error: ${err.message}. Please call dnd5e24_run_migrations then retry.`;
    }
    throw err;
  }

  if (!record) {
    return `No ${entity_type} found with identifier "${entity}" in game "${game}".`;
  }

  if (temporary) {
    const new_temporary_hp = Math.max(record.temporary_hp, amount);
    if (new_temporary_hp === record.temporary_hp) {
      return `${record.name} already has ${record.temporary_hp} temporary HP, which is higher — no change.`;
    }
    await store.patch(table, record.id, { temporary_hp: new_temporary_hp });
    return `${record.name} gains ${amount} temporary HP. Temp HP: ${new_temporary_hp}.`;
  }

  const new_current_hp = Math.min(record.max_hp, record.current_hp + amount);
  const actual = new_current_hp - record.current_hp;
  await store.patch(table, record.id, { current_hp: new_current_hp });

  const overHeal = amount > actual ? ` (${amount - actual} wasted, already at max)` : '';
  return `${record.name} recovers ${actual} HP${overHeal}. HP: ${new_current_hp}/${record.max_hp}.`;
}
