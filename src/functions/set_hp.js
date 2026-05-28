import { SupabaseStore } from '../lib/supabase_store.js';
import { ensureMigrations } from '../lib/migrations.js';

const MAX_RETRIES = 5;

export default async function set_hp(params, userSettings) {
  await ensureMigrations(userSettings);

  const { game, entity_type, entity, current_hp, max_hp } = params;

  if (current_hp == null && max_hp == null) {
    return 'Provide at least one of current_hp or max_hp.';
  }

  const table = entity_type === 'character' ? 'characters' : 'npcs';
  const store = new SupabaseStore(userSettings.externalDbUrl, userSettings.externalDbKey);

  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    const record = await store.get(table, entity, game);
    if (!record || record.game_slug !== game) {
      return `No ${entity_type} found with identifier "${entity}" in game "${game}".`;
    }

    const effectiveMax = max_hp ?? record.max_hp;
    const effectiveCurrent = current_hp != null
      ? Math.max(0, Math.min(current_hp, effectiveMax))
      : record.current_hp;

    const patch = {};
    if (max_hp != null) patch.max_hp = effectiveMax;
    if (current_hp != null) patch.current_hp = effectiveCurrent;

    // Clear death saves when reviving from 0 HP
    if (entity_type === 'character' && record.current_hp === 0 && effectiveCurrent > 0) {
      patch.death_save_successes = 0;
      patch.death_save_failures = 0;
    }

    const updated = await store.patch(table, record.id, patch, record.updated_at);
    if (updated === null) continue;

    const parts = [];
    if (max_hp != null) parts.push(`max HP → ${effectiveMax}`);
    if (current_hp != null) parts.push(`current HP → ${effectiveCurrent}`);
    const deathNote = patch.death_save_successes !== undefined ? ' Death saves cleared.' : '';
    return `${record.name}: ${parts.join(', ')}. HP: ${effectiveCurrent}/${effectiveMax}.${deathNote}`;
  }

  return `Could not set HP for "${entity}" after ${MAX_RETRIES} attempts due to concurrent updates. Please retry.`;
}
