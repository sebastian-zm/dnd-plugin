import { SupabaseStore } from '../lib/supabase_store.js';

const MAX_RETRIES = 5;

export default async function remove_item(params, userSettings) {
  const { game, entity_type, entity, item } = params;
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

    const idx = (record.equipment ?? []).indexOf(item);
    if (idx === -1) {
      return `"${item}" is not in ${record.name}'s equipment.`;
    }

    const equipment = [...record.equipment];
    equipment.splice(idx, 1);

    let updated;
    try {
      updated = await store.patch(table, record.id, { equipment }, record.updated_at);
    } catch (err) {
      if (err.code === '42P01' || err.code === '42703') {
        return `Schema error: ${err.message}. Please call dnd5e24_run_migrations then retry.`;
      }
      throw err;
    }

    if (updated === null) continue;

    const equipStr = equipment.length > 0 ? equipment.join(', ') : 'none';
    return `"${item}" removed from ${record.name}'s equipment. Equipment: ${equipStr}.`;
  }

  return `Could not update equipment for "${entity}" after ${MAX_RETRIES} attempts due to concurrent updates. Please retry.`;
}
