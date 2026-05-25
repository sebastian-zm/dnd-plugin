import { SupabaseStore } from '../lib/supabase_store.js';
import { ensureMigrations } from '../lib/migrations.js';

const MAX_RETRIES = 5;

export default async function grant_xp(params, userSettings) {
  await ensureMigrations(userSettings);

  const { game, amount, characters: targets } = params;
  const store = new SupabaseStore(userSettings.externalDbUrl, userSettings.externalDbKey);

  const gameRecord = await store.get('games', game);
  if (!gameRecord) {
    return `No game found with slug "${game}".`;
  }

  let records;
  if (!targets || targets.length === 0) {
    records = await store.list('characters', { game_slug: game });
    if (!records || records.length === 0) {
      return `No characters found in game "${game}".`;
    }
  } else {
    const fetched = await Promise.all(targets.map(t => store.get('characters', t, game)));
    const missing = targets.filter((_, i) => !fetched[i] || fetched[i].game_slug !== game);
    if (missing.length > 0) {
      return `Characters not found in game "${game}": ${missing.join(', ')}.`;
    }
    records = fetched;
  }

  const results = [];
  for (const record of records) {
    let patched = null;
    for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
      const fresh = attempt === 0 ? record : await store.get('characters', record.id, game);
      const newXp = (fresh.xp ?? 0) + amount;
      patched = await store.patch('characters', fresh.id, { xp: newXp }, fresh.updated_at);
      if (patched !== null) {
        results.push(`${fresh.name}: ${fresh.xp ?? 0} → ${newXp} XP`);
        break;
      }
    }
    if (patched === null) {
      results.push(`${record.name}: failed to update after ${MAX_RETRIES} attempts`);
    }
  }

  return `Granted ${amount} XP.\n${results.join('\n')}`;
}
