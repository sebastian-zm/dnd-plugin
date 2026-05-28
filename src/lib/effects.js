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
export async function expireEffects(userSettings, game_slug, upToRound) {
  const { externalDbUrl, externalDbKey } = userSettings;
  const headers = {
    apikey: externalDbKey,
    Authorization: `Bearer ${externalDbKey}`,
    'Content-Type': 'application/json',
    Prefer: 'return=representation',
  };
  const url =
    `${externalDbUrl}/rest/v1/active_effects` +
    `?game_slug=eq.${encodeURIComponent(game_slug)}` +
    `&expires_at_round=not.is.null` +
    `&expires_at_round=lte.${upToRound}`;
  const res = await fetch(url, { method: 'DELETE', headers });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(`Failed to expire effects: ${body.message ?? res.statusText}`);
  }
  return res.json();
}
