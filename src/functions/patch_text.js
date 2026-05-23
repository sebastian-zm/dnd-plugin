import { SupabaseStore } from '../lib/supabase_store.js';

const MAX_RETRIES = 5;

const TABLE_MAP = {
  character: 'characters',
  npc: 'npcs',
  game: 'games',
  memory: 'game_memories',
};

export default async function patch_text(params, userSettings) {
  const { entity_type, entity, game, field, search, replacement } = params;
  const table = TABLE_MAP[entity_type];
  const store = new SupabaseStore(userSettings.externalDbUrl, userSettings.externalDbKey);

  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    let record;
    try {
      record = entity_type === 'game'
        ? await store.get(table, entity)
        : await store.get(table, entity, game);
    } catch (err) {
      if (err.code === '42P01' || err.code === '42703') {
        return `Schema error: ${err.message}. Please call dnd5e24_run_migrations then retry.`;
      }
      throw err;
    }

    if (!record) {
      return `No ${entity_type} found with identifier "${entity}"${game ? ` in game "${game}"` : ''}.`;
    }

    if (entity_type !== 'game' && record.game_slug !== game) {
      return `No ${entity_type} found with identifier "${entity}" in game "${game}".`;
    }

    const text = record[field];
    if (typeof text !== 'string') {
      return `Field "${field}" is not a text field or does not exist on ${entity_type} "${entity}".`;
    }

    if (!text.includes(search)) {
      return `Search text not found in field "${field}" of ${entity_type} "${entity}". Make sure to copy the exact text from the record.`;
    }

    const updated_text = text.replace(search, replacement);

    let updated;
    try {
      updated = await store.patch(table, record.id, { [field]: updated_text }, record.updated_at);
    } catch (err) {
      if (err.code === '42P01' || err.code === '42703') {
        return `Schema error: ${err.message}. Please call dnd5e24_run_migrations then retry.`;
      }
      throw err;
    }

    if (updated === null) continue;

    return `Field "${field}" on ${entity_type} "${entity}" updated.`;
  }

  return `Could not update "${entity}" after ${MAX_RETRIES} attempts due to concurrent writes. Please retry.`;
}
