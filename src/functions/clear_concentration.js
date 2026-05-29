import { SupabaseStore } from '../lib/supabase_store.js';
import { ensureMigrations } from '../lib/migrations.js';
import { clearConcentrationEffects } from '../lib/effects.js';

const MAX_RETRIES = 5;

export default async function clear_concentration(params, userSettings) {
  await ensureMigrations(userSettings);

  const { game, entity_type, entity } = params;
  const table = entity_type === 'character' ? 'characters' : 'npcs';
  const store = new SupabaseStore(userSettings.externalDbUrl, userSettings.externalDbKey);

  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    const record = await store.get(table, entity, game);
    if (!record || record.game_slug !== game) {
      return `No ${entity_type} found with identifier "${entity}" in game "${game}".`;
    }

    if (!record.concentration) {
      return `${record.name} is not concentrating on any spell.`;
    }

    const spell = record.concentration.spell;
    const updated = await store.patch(table, record.id, { concentration: null }, record.updated_at);
    if (updated === null) continue;

    // Remove all active effects whose concentration owner is this entity.
    // Match on the canonical slug since apply_effect stores the resolved slug.
    await clearConcentrationEffects(store, game, entity_type, record.slug);

    return `${record.name} loses concentration on ${spell}.`;
  }

  return `Could not clear concentration for "${entity}" after ${MAX_RETRIES} attempts due to concurrent updates. Please retry.`;
}
