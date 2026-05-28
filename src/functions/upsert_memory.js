import { SupabaseStore } from '../lib/supabase_store.js';
import { ensureMigrations } from '../lib/migrations.js';

export default async function upsert_memory(params, userSettings) {
  await ensureMigrations(userSettings);

  const { game, slug, name, memory, tags } = params;
  const store = new SupabaseStore(userSettings.externalDbUrl, userSettings.externalDbKey);

  const existing = await store.get('game_memories', slug, game);
  let row;
  if (existing) {
    const patch = { name, memory };
    if (tags !== undefined) patch.tags = tags;
    row = await store.patch('game_memories', existing.id, patch);
  } else {
    row = await store.insert('game_memories', {
      id: crypto.randomUUID(),
      game_slug: game,
      slug,
      name,
      memory,
      tags: tags ?? [],
    });
  }

  const tagStr = row.tags?.length ? ` [tags: ${row.tags.join(', ')}]` : '';
  return `Memory "${row.name}" (${row.slug})${tagStr} saved for game "${game}".`;
}
