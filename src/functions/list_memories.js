import { SupabaseStore } from '../lib/supabase_store.js';
import { ensureMigrations } from '../lib/migrations.js';

export default async function list_memories(params, userSettings) {
  await ensureMigrations(userSettings);

  const { game } = params;
  const store = new SupabaseStore(userSettings.externalDbUrl, userSettings.externalDbKey);
  const memories = await store.list('game_memories', { game_slug: game });

  if (memories.length === 0) {
    return `No memories found for game "${game}".`;
  }

  return JSON.stringify(memories.map(m => ({
    slug: m.slug,
    name: m.name,
    memory: m.memory,
  })));
}
