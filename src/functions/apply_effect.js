import { SupabaseStore } from '../lib/supabase_store.js';
import { ensureMigrations } from '../lib/migrations.js';
import { EFFECT_TEMPLATES } from '../lib/effects.js';

export default async function apply_effect(params, userSettings) {
  await ensureMigrations(userSettings);

  const {
    game, targets, effect,
    source_type, source,
    concentration: concOverride,
    duration_rounds: durationOverride,
    modifiers: modifiersOverride,
    notes,
  } = params;

  const store = new SupabaseStore(userSettings.externalDbUrl, userSettings.externalDbKey);

  const gameRecord = await store.get('games', game);
  if (!gameRecord) return `No game found with slug "${game}".`;

  let template;
  if (effect === 'custom') {
    if (!modifiersOverride || modifiersOverride.length === 0) {
      return 'Custom effects require at least one modifier in the modifiers array.';
    }
    template = {
      name: notes || 'Custom Effect',
      concentration: concOverride ?? false,
      duration_rounds: durationOverride ?? -1,
      modifiers: modifiersOverride,
    };
  } else {
    template = EFFECT_TEMPLATES[effect];
    if (!template) {
      return `Unknown effect template "${effect}". Valid templates: ${Object.keys(EFFECT_TEMPLATES).join(', ')}, custom.`;
    }
  }

  const finalConcentration = concOverride ?? template.concentration;
  const finalDuration = durationOverride ?? template.duration_rounds;
  const finalModifiers = (effect !== 'custom' && modifiersOverride) ? modifiersOverride : template.modifiers;
  const effectName = effect === 'custom' ? (notes || 'Custom Effect') : template.name;

  const concOwnerType = finalConcentration ? (source_type ?? null) : null;
  const concOwner = finalConcentration ? (source ?? null) : null;

  // Compute absolute expiry round when combat is active and duration is finite.
  const expiresAtRound = (gameRecord.combat_active && finalDuration !== -1)
    ? gameRecord.combat_round + finalDuration
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
      concentration: finalConcentration,
      concentration_owner_type: concOwnerType,
      concentration_owner: concOwner,
      duration_rounds: finalDuration,
      expires_at_round: expiresAtRound,
      modifiers: finalModifiers,
      notes: notes ?? null,
    });

    let durStr;
    if (finalDuration === -1) {
      durStr = 'indefinite duration';
    } else if (expiresAtRound != null) {
      durStr = `${finalDuration} rounds (expires after round ${expiresAtRound})`;
    } else {
      durStr = `${finalDuration} rounds (timer starts when combat begins)`;
    }

    const concStr = finalConcentration
      ? (concOwner ? ` [concentration: ${concOwner}]` : ' [concentration]')
      : '';

    results.push(`  ${record.name} (${entity_type}): ${effectName} applied — ${durStr}${concStr}`);
  }

  const modSummary = finalModifiers.map(m => {
    const dice = m.dice ? ` ${m.dice}` : '';
    const val = m.value != null ? ` ${m.value}` : '';
    const dt = m.damage_type ? ` [${m.damage_type}]` : '';
    const ab = m.ability ? ` (${m.ability} only)` : '';
    return `    • ${m.type}${dice}${val}${dt}${ab} on [${(m.roll_types ?? []).join(', ')}]`;
  }).join('\n');

  return `Effect applied:\n${results.join('\n')}\nModifiers:\n${modSummary}`;
}
