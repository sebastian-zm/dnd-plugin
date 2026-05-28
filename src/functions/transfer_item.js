import { SupabaseStore } from '../lib/supabase_store.js';
import { ensureMigrations } from '../lib/migrations.js';

const MAX_RETRIES = 5;

export default async function transfer_item(params, userSettings) {
  await ensureMigrations(userSettings);

  const { game, from_entity_type, from_entity, to_entity_type, to_entity, item } = params;
  const store = new SupabaseStore(userSettings.externalDbUrl, userSettings.externalDbKey);

  const fromTable = from_entity_type === 'character' ? 'characters' : 'npcs';
  const toTable = to_entity_type === 'character' ? 'characters' : 'npcs';

  // Remove from source
  let fromRecord;
  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    const record = await store.get(fromTable, from_entity, game);
    if (!record || record.game_slug !== game) {
      return `No ${from_entity_type} found with identifier "${from_entity}" in game "${game}".`;
    }

    const idx = (record.equipment ?? []).indexOf(item);
    if (idx === -1) {
      return `"${item}" is not in ${record.name}'s equipment.`;
    }

    const equipment = [...record.equipment];
    equipment.splice(idx, 1);
    const updated = await store.patch(fromTable, record.id, { equipment }, record.updated_at);
    if (updated === null) continue;

    fromRecord = record;
    break;
  }

  if (!fromRecord) {
    return `Could not remove "${item}" from "${from_entity}" after ${MAX_RETRIES} attempts. Please retry.`;
  }

  // Add to destination
  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    const record = await store.get(toTable, to_entity, game);
    if (!record || record.game_slug !== game) {
      return `Item removed from ${fromRecord.name} but destination "${to_entity}" not found — item may be lost. Add it manually.`;
    }

    const equipment = [...(record.equipment ?? []), item];
    const updated = await store.patch(toTable, record.id, { equipment }, record.updated_at);
    if (updated === null) continue;

    return `"${item}" transferred from ${fromRecord.name} to ${record.name}.`;
  }

  return `Item removed from ${fromRecord.name} but could not add to "${to_entity}" after ${MAX_RETRIES} attempts. Item may be lost — add it manually.`;
}
