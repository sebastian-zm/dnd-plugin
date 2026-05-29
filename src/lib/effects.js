// Load all active effects targeting a specific entity.
export async function loadEffectsForEntity(store, game_slug, target_type, target) {
  return store.list('active_effects', { game_slug, target_type, target });
}

// Delete all concentration effects whose owner is the given entity.
// Called by clear_concentration when a caster drops concentration.
export async function clearConcentrationEffects(store, game_slug, concentration_owner_type, concentration_owner) {
  return store.deleteWhere('active_effects', {
    game_slug,
    concentration_owner_type,
    concentration_owner,
    concentration: true,
  });
}

// Delete all effects in a game whose expires_at_round <= upToRound.
// Returns the deleted effect records so advance_turn can report what expired.
// NULL expires_at_round rows are excluded automatically: NULL <= n is never true.
export async function expireEffects(store, game_slug, upToRound) {
  return store.deleteWhere(
    'active_effects',
    { game_slug, expires_at_round: { op: 'lte', value: upToRound } },
    { returning: true },
  );
}
