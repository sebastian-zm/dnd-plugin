import { SupabaseStore } from '../lib/supabase_store.js';
import { ensureMigrations } from '../lib/migrations.js';

export default async function log_event(params, userSettings) {
  await ensureMigrations(userSettings);

  const { game, entry, category } = params;
  const store = new SupabaseStore(userSettings.externalDbUrl, userSettings.externalDbKey);

  const gameRecord = await store.get('games', game);
  if (!gameRecord) {
    return `No game found with slug "${game}".`;
  }

  await store.insert('session_logs', {
    id: crypto.randomUUID(),
    game_slug: game,
    entry,
    category: category ?? null,
    world_time: gameRecord.world_time ?? null,
  });

  const catStr = category ? ` [${category}]` : '';
  const timeStr = gameRecord.world_time
    ? ` (${formatTime(gameRecord.world_time)})`
    : '';
  return `Logged${catStr}${timeStr}: ${entry}`;
}

function formatTime(t) {
  return `Day ${t.day}, ${String(t.hour).padStart(2, '0')}:${String(t.minute).padStart(2, '0')}`;
}
