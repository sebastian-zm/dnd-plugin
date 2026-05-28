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

export default async function give_item(params, userSettings) {
  await ensureMigrations(userSettings);

  const { game, entity_type, entity, item, quantity = 1 } = params;
  const table = entity_type === 'character' ? 'characters' : 'npcs';
  const store = new SupabaseStore(userSettings.externalDbUrl, userSettings.externalDbKey);

  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    const record = await store.get(table, entity, game);

    if (!record || record.game_slug !== game) {
      return `No ${entity_type} found with identifier "${entity}" in game "${game}".`;
    }

    const equipment = [...(record.equipment ?? [])];
    const existing = findStackedItem(equipment, item);
    let resultEntry;

    if (existing) {
      const newQty = existing.quantity + quantity;
      resultEntry = newQty === 1 ? item : `${item} (x${newQty})`;
      equipment[existing.idx] = resultEntry;
    } else {
      resultEntry = quantity === 1 ? item : `${item} (x${quantity})`;
      equipment.push(resultEntry);
    }

    const updated = await store.patch(table, record.id, { equipment }, record.updated_at);
    if (updated === null) continue;

    const action = existing ? `updated to "${resultEntry}"` : `"${resultEntry}" added`;
    return `${action} in ${record.name}'s equipment. Equipment: ${equipment.join(', ')}.`;
  }

  return `Could not update equipment for "${entity}" after ${MAX_RETRIES} attempts due to concurrent updates. Please retry.`;
}
