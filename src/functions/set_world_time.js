import { SupabaseStore } from '../lib/supabase_store.js';
import { ensureMigrations } from '../lib/migrations.js';

export default async function set_world_time(params, userSettings) {
  await ensureMigrations(userSettings);

  const { game, day, hour = 0, minute = 0, note } = params;
  const store = new SupabaseStore(userSettings.externalDbUrl, userSettings.externalDbKey);

  const gameRecord = await store.get('games', game);
  if (!gameRecord) {
    return `No game found with slug "${game}".`;
  }

  const world_time = { day, hour, minute, note: note ?? null };
  await store.patch('games', gameRecord.id, { world_time });

  const timeStr = formatTime(world_time);
  const noteStr = note ? ` — ${note}` : '';
  return `World time set to ${timeStr}${noteStr}.`;
}

function formatTime(t) {
  return `Day ${t.day}, ${String(t.hour).padStart(2, '0')}:${String(t.minute).padStart(2, '0')}`;
}
