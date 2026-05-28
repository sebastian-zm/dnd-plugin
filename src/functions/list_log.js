import { SupabaseStore } from '../lib/supabase_store.js';
import { ensureMigrations } from '../lib/migrations.js';

export default async function list_log(params, userSettings) {
  await ensureMigrations(userSettings);

  const { game, category, limit = 50 } = params;
  const store = new SupabaseStore(userSettings.externalDbUrl, userSettings.externalDbKey);

  const gameRecord = await store.get('games', game);
  if (!gameRecord) {
    return `No game found with slug "${game}".`;
  }

  const filters = { game_slug: game };
  if (category) filters.category = category;

  const entries = await store.list('session_logs', filters, {
    order: 'created_at.asc',
    limit,
  });

  if (entries.length === 0) {
    const catStr = category ? ` with category "${category}"` : '';
    return `No log entries${catStr} found for game "${gameRecord.name}".`;
  }

  const lines = entries.map(e => {
    const timeStr = e.world_time
      ? `[Day ${e.world_time.day}, ${String(e.world_time.hour).padStart(2, '0')}:${String(e.world_time.minute).padStart(2, '0')}]`
      : `[${e.created_at.slice(0, 16).replace('T', ' ')}]`;
    const catStr = e.category ? ` [${e.category}]` : '';
    return `${timeStr}${catStr} ${e.entry}`;
  });

  const catFilter = category ? ` (category: ${category})` : '';
  const limitNote = entries.length === limit ? ` — showing last ${limit}` : '';
  return `Session log for "${gameRecord.name}"${catFilter}${limitNote}:\n\n${lines.join('\n')}`;
}
