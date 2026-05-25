import { SupabaseStore } from '../lib/supabase_store.js';
import { ensureMigrations } from '../lib/migrations.js';

const MAX_RETRIES = 5;

export default async function use_resource(params, userSettings) {
  await ensureMigrations(userSettings);

  const { game, entity_type, entity, resource_name, amount = 1, action = 'use' } = params;
  const table = entity_type === 'character' ? 'characters' : 'npcs';
  const store = new SupabaseStore(userSettings.externalDbUrl, userSettings.externalDbKey);

  const gameRecord = await store.get('games', game);
  if (!gameRecord) {
    return `No game found with slug "${game}".`;
  }

  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    const record = await store.get(table, entity, game);
    if (!record || record.game_slug !== game) {
      return `No ${entity_type} found with identifier "${entity}" in game "${game}".`;
    }

    const resources = record.resources ?? [];
    const idx = resources.findIndex(r => r.name === resource_name);
    if (idx === -1) {
      const available = resources.map(r => r.name).join(', ') || 'none';
      return `${record.name} has no resource named "${resource_name}". Available: ${available}.`;
    }

    const resource = resources[idx];

    if (action === 'use') {
      if (resource.current < amount) {
        return `${record.name} only has ${resource.current}/${resource.max} ${resource_name} remaining — cannot spend ${amount}.`;
      }
      const newCurrent = resource.current - amount;
      const updated = resources.map((r, i) => i === idx ? { ...r, current: newCurrent } : r);
      const result = await store.patch(table, record.id, { resources: updated }, record.updated_at);
      if (result === null) continue;
      return `${record.name} uses ${amount} ${resource_name}. Remaining: ${newCurrent}/${resource.max}.`;
    }

    // restore
    const newCurrent = Math.min(resource.max, resource.current + amount);
    const gained = newCurrent - resource.current;
    if (gained === 0) {
      return `${record.name}'s ${resource_name} is already at maximum (${resource.max}/${resource.max}).`;
    }
    const updated = resources.map((r, i) => i === idx ? { ...r, current: newCurrent } : r);
    const result = await store.patch(table, record.id, { resources: updated }, record.updated_at);
    if (result === null) continue;
    return `${record.name} recovers ${gained} ${resource_name}. Remaining: ${newCurrent}/${resource.max}.`;
  }

  return `Could not update resource for "${entity}" after ${MAX_RETRIES} attempts due to concurrent updates. Please retry.`;
}
