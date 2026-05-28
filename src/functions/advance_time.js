import { SupabaseStore } from '../lib/supabase_store.js';
import { ensureMigrations } from '../lib/migrations.js';

export default async function advance_time(params, userSettings) {
  await ensureMigrations(userSettings);

  const { game, minutes, note } = params;
  const store = new SupabaseStore(userSettings.externalDbUrl, userSettings.externalDbKey);

  const gameRecord = await store.get('games', game);
  if (!gameRecord) {
    return `No game found with slug "${game}".`;
  }

  const current = gameRecord.world_time ?? { day: 1, hour: 0, minute: 0, note: null };

  const totalMinutes = current.day * 1440 + current.hour * 60 + current.minute + minutes;
  const newDay = Math.floor(totalMinutes / 1440);
  const dayRemainder = totalMinutes % 1440;
  const newHour = Math.floor(dayRemainder / 60);
  const newMinute = dayRemainder % 60;

  const world_time = {
    day: newDay,
    hour: newHour,
    minute: newMinute,
    note: note ?? null,
  };

  await store.patch('games', gameRecord.id, { world_time });

  const fromStr = formatTime(current);
  const toStr = formatTime(world_time);
  const deltaStr = formatDelta(minutes);
  const noteStr = note ? ` — ${note}` : '';
  return `Time advanced by ${deltaStr}. ${fromStr} → ${toStr}.${noteStr}`;
}

function formatTime(t) {
  return `Day ${t.day}, ${String(t.hour).padStart(2, '0')}:${String(t.minute).padStart(2, '0')}`;
}

function formatDelta(minutes) {
  if (minutes < 60) return `${minutes} minute${minutes !== 1 ? 's' : ''}`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  const hStr = `${h} hour${h !== 1 ? 's' : ''}`;
  const mStr = m > 0 ? ` ${m} minute${m !== 1 ? 's' : ''}` : '';
  return hStr + mStr;
}
