import { SupabaseStore } from '../lib/supabase_store.js';
import { ensureMigrations } from '../lib/migrations.js';

const MAX_RETRIES = 5;

export default async function remove_item(params, userSettings) {
  await ensureMigrations(userSettings);

  const { game, entity_type, entity, item } = params;
  const table = entity_type === 'character' ? 'characters' : 'npcs';
  const store = new SupabaseStore(userSettings.externalDbUrl, userSettings.externalDbKey);

  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    const record = await store.get(table, entity, game);

    if (!record || record.game_slug !== game) {
      return `No ${entity_type} found with identifier "${entity}" in game "${game}".`;
    }

    const idx = (record.equipment ?? []).indexOf(item);
    if (idx === -1) {
      return `"${item}" is not in ${record.name}'s equipment.`;
    }

    const equipment = [...record.equipment];
    equipment.splice(idx, 1);
    const updated = await store.patch(table, record.id, { equipment }, record.updated_at);

    if (updated === null) continue;

    const equipStr = equipment.length > 0 ? equipment.join(', ') : 'none';
    return `"${item}" removed from ${record.name}'s equipment. Equipment: ${equipStr}.`;
  }

  return `Could not update equipment for "${entity}" after ${MAX_RETRIES} attempts due to concurrent updates. Please retry.`;
}
