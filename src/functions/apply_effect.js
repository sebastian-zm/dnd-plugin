import { SupabaseStore } from '../lib/supabase_store.js';
import { ensureMigrations } from '../lib/migrations.js';

export default async function apply_effect(params, userSettings) {
  await ensureMigrations(userSettings);

  const {
    game,
    targets,
    name: effectName,
    source_type,
    source,
    concentration = false,
    duration_rounds = -1,
    end_on_save,
    notes,
  } = params;

  const store = new SupabaseStore(userSettings.externalDbUrl, userSettings.externalDbKey);

  const gameRecord = await store.get('games', game);
  if (!gameRecord) return `No game found with slug "${game}".`;

  const concOwnerType = concentration ? (source_type ?? null) : null;
  const concOwner = concentration ? (source ?? null) : null;

  // Pre-compute the absolute round at which this effect expires.
  // Only meaningful when combat is already running; otherwise the DM
  // should call apply_effect again (or remove_effect) at the right time.
  const expiresAtRound = (gameRecord.combat_active && duration_rounds !== -1)
    ? gameRecord.combat_round + duration_rounds
    : null;

  const results = [];
  for (const t of targets) {
    const { entity_type, entity } = t;
    const table = entity_type === 'character' ? 'characters' : 'npcs';
    const record = await store.get(table, entity, game);
    if (!record || record.game_slug !== game) {
      results.push(`  ${entity} (${entity_type}): not found in game "${game}"`);
      continue;
    }

    await store.insert('active_effects', {
      id: crypto.randomUUID(),
      game_slug: game,
      target_type: entity_type,
      target: entity,
      name: effectName,
      source_type: source_type ?? null,
      source: source ?? null,
      concentration,
      concentration_owner_type: concOwnerType,
      concentration_owner: concOwner,
      duration_rounds,
      expires_at_round: expiresAtRound,
      end_on_save: end_on_save ?? null,
      modifiers: [],
      notes: notes ?? null,
    });

    const parts = [];

    if (duration_rounds === -1) {
      parts.push('indefinite duration');
    } else if (expiresAtRound != null) {
      parts.push(`${duration_rounds}r (expires after round ${expiresAtRound})`);
    } else {
      parts.push(`${duration_rounds}r (timer starts when combat begins)`);
    }

    if (end_on_save) {
      parts.push(`save to end: DC ${end_on_save.dc} ${end_on_save.ability} at end of their turn`);
    }

    if (concentration) {
      parts.push(concOwner ? `concentration: ${concOwner}` : 'concentration');
    }

    results.push(`  ${record.name} (${entity_type}): "${effectName}" — ${parts.join(' | ')}`);
  }

  return `Applied effect:\n${results.join('\n')}`;
}
