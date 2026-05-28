import { SupabaseStore } from '../lib/supabase_store.js';
import { ensureMigrations } from '../lib/migrations.js';

export default async function list_memories(params, userSettings) {
  await ensureMigrations(userSettings);

  const { game, tag } = params;
  const store = new SupabaseStore(userSettings.externalDbUrl, userSettings.externalDbKey);

  const gameRecord = await store.get('games', game);
  if (!gameRecord) {
    return `No game found with slug "${game}".`;
  }

  const memories = await store.list('game_memories', { game_slug: game });

  if (memories.length === 0) {
    return `No memories found for game "${game}".`;
  }

  const filtered = tag
    ? memories.filter(m => (m.tags ?? []).includes(tag))
    : memories;

  if (filtered.length === 0) {
    return `No memories with tag "${tag}" found in game "${game}".`;
  }

  return JSON.stringify(filtered.map(m => ({
    slug: m.slug,
    name: m.name,
    memory: m.memory,
    tags: m.tags ?? [],
  })));
}
