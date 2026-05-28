import { SupabaseStore } from '../lib/supabase_store.js';
import { ensureMigrations } from '../lib/migrations.js';

const MAX_RETRIES = 5;

function escapeRegExp(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function findStackedItem(equipment, itemName) {
  const pattern = new RegExp(`^${escapeRegExp(itemName)} \\(x(\\d+)\\)$`);
  for (let i = 0; i < equipment.length; i++) {
    if (equipment[i] === itemName) return { idx: i, quantity: 1 };
    const m = equipment[i].match(pattern);
    if (m) return { idx: i, quantity: parseInt(m[1], 10) };
  }
  return null;
}

export default async function remove_item(params, userSettings) {
  await ensureMigrations(userSettings);

  const { game, entity_type, entity, item, quantity = 1 } = params;
  const table = entity_type === 'character' ? 'characters' : 'npcs';
  const store = new SupabaseStore(userSettings.externalDbUrl, userSettings.externalDbKey);

  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    const record = await store.get(table, entity, game);

    if (!record || record.game_slug !== game) {
      return `No ${entity_type} found with identifier "${entity}" in game "${game}".`;
    }

    const existing = findStackedItem(record.equipment ?? [], item);
    if (!existing) {
      return `"${item}" is not in ${record.name}'s equipment.`;
    }

    const equipment = [...record.equipment];
    const newQty = existing.quantity - quantity;

    if (newQty <= 0) {
      equipment.splice(existing.idx, 1);
    } else if (newQty === 1) {
      equipment[existing.idx] = item;
    } else {
      equipment[existing.idx] = `${item} (x${newQty})`;
    }

    const updated = await store.patch(table, record.id, { equipment }, record.updated_at);
    if (updated === null) continue;

    const removedNote = newQty <= 0
      ? `"${item}" removed`
      : `"${item}" updated to ${newQty === 1 ? `"${item}"` : `"${item} (x${newQty})"`}`;
    const equipStr = equipment.length > 0 ? equipment.join(', ') : 'none';
    return `${removedNote} from ${record.name}'s equipment. Equipment: ${equipStr}.`;
  }

  return `Could not update equipment for "${entity}" after ${MAX_RETRIES} attempts due to concurrent updates. Please retry.`;
}
