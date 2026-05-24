import { SupabaseStore } from '../lib/supabase_store.js';
import { ensureMigrations } from '../lib/migrations.js';

const MAX_RETRIES = 5;

export default async function apply_healing(params, userSettings) {
  await ensureMigrations(userSettings);

  const { game, entity_type, entity, amount, temporary } = params;
  const table = entity_type === 'character' ? 'characters' : 'npcs';
  const store = new SupabaseStore(userSettings.externalDbUrl, userSettings.externalDbKey);

  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    const record = await store.get(table, entity, game);

    if (!record || record.game_slug !== game) {
      return `No ${entity_type} found with identifier "${entity}" in game "${game}".`;
    }

    if (temporary) {
      const new_temporary_hp = Math.max(record.temporary_hp, amount);
      if (new_temporary_hp === record.temporary_hp) {
        return `${record.name} already has ${record.temporary_hp} temporary HP, which is at least as high — no change.`;
      }
      const updated = await store.patch(table, record.id, { temporary_hp: new_temporary_hp }, record.updated_at);
      if (updated === null) continue;
      return `${record.name} gains ${amount} temporary HP. Temp HP: ${new_temporary_hp}.`;
    }

    const new_current_hp = Math.min(record.max_hp, record.current_hp + amount);
    const actual = new_current_hp - record.current_hp;
    const updated = await store.patch(table, record.id, { current_hp: new_current_hp }, record.updated_at);
    if (updated === null) continue;

    const overHeal = amount > actual ? ` (${amount - actual} wasted, already at max)` : '';
    return `${record.name} recovers ${actual} HP${overHeal}. HP: ${new_current_hp}/${record.max_hp}.`;
  }

  return `Could not apply healing to "${entity}" after ${MAX_RETRIES} attempts due to concurrent updates. Please retry.`;
}
