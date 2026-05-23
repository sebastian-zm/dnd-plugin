import { SupabaseStore } from '../lib/supabase_store.js';

const MAX_RETRIES = 5;

export default async function apply_damage(params, userSettings) {
  const { game, entity_type, entity, amount, damage_type } = params;

  const table = entity_type === 'character' ? 'characters' : 'npcs';
  const store = new SupabaseStore(userSettings.externalDbUrl, userSettings.externalDbKey);

  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    let record;
    try {
      record = await store.get(table, entity, game);
    } catch (err) {
      if (err.code === '42P01' || err.code === '42703') {
        return `Schema error: ${err.message}. Please call dnd5e24_run_migrations then retry.`;
      }
      throw err;
    }

    if (!record || record.game_slug !== game) {
      return `No ${entity_type} found with identifier "${entity}" in game "${game}".`;
    }

    const tempAbsorbed = Math.min(record.temporary_hp, amount);
    const remaining = amount - tempAbsorbed;
    const new_temporary_hp = record.temporary_hp - tempAbsorbed;
    const new_current_hp = Math.max(0, record.current_hp - remaining);

    let updated;
    try {
      updated = await store.patch(table, record.id, {
        current_hp: new_current_hp,
        temporary_hp: new_temporary_hp,
      }, record.updated_at);
    } catch (err) {
      if (err.code === '42P01' || err.code === '42703') {
        return `Schema error: ${err.message}. Please call dnd5e24_run_migrations then retry.`;
      }
      throw err;
    }

    if (updated === null) continue;

    const typeStr = damage_type ? ` ${damage_type}` : '';
    const tempNote = tempAbsorbed > 0 ? ` (${tempAbsorbed} absorbed by temporary HP)` : '';
    let status = '.';
    if (new_current_hp === 0) {
      status = entity_type === 'character'
        ? ' — now at 0 HP. Unconscious; rolling death saves.'
        : ' — now at 0 HP. Dead.';
    }
    const tempStr = new_temporary_hp > 0 ? `, Temp HP: ${new_temporary_hp}` : '';

    return `${record.name} takes ${amount}${typeStr} damage${tempNote}. HP: ${new_current_hp}/${record.max_hp}${tempStr}${status}`;
  }

  return `Could not apply damage to "${entity}" after ${MAX_RETRIES} attempts due to concurrent updates. Please retry.`;
}
