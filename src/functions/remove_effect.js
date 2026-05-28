import { SupabaseStore } from '../lib/supabase_store.js';
import { ensureMigrations } from '../lib/migrations.js';

export default async function remove_effect(params, userSettings) {
  await ensureMigrations(userSettings);

  const { game, effect_id, name, target_type, target } = params;
  const store = new SupabaseStore(userSettings.externalDbUrl, userSettings.externalDbKey);

  if (effect_id) {
    const effects = await store.list('active_effects', { game_slug: game });
    const found = effects.find(e => e.id === effect_id || e.id.startsWith(effect_id));
    if (!found) {
      return `No effect with ID "${effect_id}" found in game "${game}".`;
    }
    await store.delete('active_effects', found.id);
    return `Removed "${found.name}" (${found.id.slice(0, 8)}) from "${found.target}".`;
  }

  if (!name) {
    return 'Provide either effect_id or name (and optionally target) to identify the effect.';
  }

  const filters = { game_slug: game, name };
  if (target_type) filters.target_type = target_type;
  if (target) filters.target = target;

  const effects = await store.list('active_effects', filters);
  if (effects.length === 0) {
    const scope = target ? `on "${target}"` : `in game "${game}"`;
    return `No active effect named "${name}" found ${scope}.`;
  }

  for (const e of effects) {
    await store.delete('active_effects', e.id);
  }

  const who = target ? `"${target}"` : 'all targets';
  return `Removed ${effects.length} instance(s) of "${name}" from ${who}.`;
}
