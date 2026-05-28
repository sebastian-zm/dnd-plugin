import { SupabaseStore } from '../lib/supabase_store.js';
import { ensureMigrations } from '../lib/migrations.js';

const MAX_RETRIES = 5;

export default async function remove_item(params, userSettings) {
  await ensureMigrations(userSettings);

  const { game, entity_type, entity, item, quantity = 1 } = params;
  const table = entity_type === 'character' ? 'characters' : 'npcs';
  const store = new SupabaseStore(userSettings.externalDbUrl, userSettings.externalDbKey);

  // If quantity > 1, look for the grouped entry stored by give_item
  const itemEntry = quantity > 1 ? `${item} (x${quantity})` : item;

  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    const record = await store.get(table, entity, game);

    if (!record || record.game_slug !== game) {
      return `No ${entity_type} found with identifier "${entity}" in game "${game}".`;
    }

    const idx = (record.equipment ?? []).indexOf(itemEntry);
    if (idx === -1) {
      const hint = quantity > 1 ? ` (looked for "${itemEntry}")` : '';
      return `"${item}" is not in ${record.name}'s equipment${hint}.`;
    }

    const equipment = [...record.equipment];
    equipment.splice(idx, 1);
    const updated = await store.patch(table, record.id, { equipment }, record.updated_at);

    if (updated === null) continue;

    const equipStr = equipment.length > 0 ? equipment.join(', ') : 'none';
    return `"${itemEntry}" removed from ${record.name}'s equipment. Equipment: ${equipStr}.`;
  }

  return `Could not update equipment for "${entity}" after ${MAX_RETRIES} attempts due to concurrent updates. Please retry.`;
}
