import { SupabaseStore } from '../lib/supabase_store.js';
import { ensureMigrations } from '../lib/migrations.js';

const MAX_RETRIES = 5;

export default async function use_spell_slot(params, userSettings) {
  await ensureMigrations(userSettings);

  const { game, character, level } = params;
  const store = new SupabaseStore(userSettings.externalDbUrl, userSettings.externalDbKey);

  const gameRecord = await store.get('games', game);
  if (!gameRecord) {
    return `No game found with slug "${game}".`;
  }

  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    const record = await store.get('characters', character, game);
    if (!record || record.game_slug !== game) {
      return `No character found with identifier "${character}" in game "${game}".`;
    }

    const usable = record.spell_slots_usable ?? {};
    const available = usable[String(level)] ?? 0;

    if (available <= 0) {
      return `${record.name} has no level ${level} spell slots remaining.`;
    }

    const newUsable = { ...usable, [String(level)]: available - 1 };
    const updated = await store.patch('characters', record.id, { spell_slots_usable: newUsable }, record.updated_at);
    if (updated === null) continue;

    const remaining = available - 1;
    const total = (record.spell_slots_total ?? {})[String(level)] ?? 0;
    return `${record.name} expends a level ${level} spell slot. Slots remaining: ${remaining}/${total}.`;
  }

  return `Could not expend spell slot for "${character}" after ${MAX_RETRIES} attempts due to concurrent updates. Please retry.`;
}
