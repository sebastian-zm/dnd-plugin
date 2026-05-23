import { SupabaseStore } from '../lib/supabase_store.js';

export default async function apply_damage(params, userSettings) {
  const { game, entity_type, entity, amount, damage_type } = params;

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

  const tempAbsorbed = Math.min(record.temporary_hp, amount);
  const remaining = amount - tempAbsorbed;
  const new_temporary_hp = record.temporary_hp - tempAbsorbed;
  const new_current_hp = Math.max(0, record.current_hp - remaining);

  await store.patch(table, record.id, {
    current_hp: new_current_hp,
    temporary_hp: new_temporary_hp,
  });

  const typeStr = damage_type ? ` ${damage_type}` : '';
  const tempNote = tempAbsorbed > 0 ? ` (${tempAbsorbed} absorbed by temporary HP)` : '';
  const status = new_current_hp === 0 ? ' — now at 0 HP (unconscious or dead).' : `.`;

  return `${record.name} takes ${amount}${typeStr} damage${tempNote}. HP: ${new_current_hp}/${record.max_hp}${record.temporary_hp !== new_temporary_hp ? `, Temp HP: ${new_temporary_hp}` : ''}${status}`;
}
