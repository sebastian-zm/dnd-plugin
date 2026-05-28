// Built-in effect templates for common D&D 2024 spells and conditions.
// The 'modifiers' array defines what the effect does to rolls.
// modifier.type: bonus_dice | subtract_dice | flat_bonus | flat_penalty | advantage | disadvantage | grant_advantage
// modifier.roll_types: attack | save | damage | ability_check | initiative
// modifier.dice: dice expression for bonus_dice/subtract_dice (e.g. "1d4")
// modifier.value: number for flat_bonus/flat_penalty
// modifier.damage_type: label for the type of bonus damage (informational, not a filter)
// modifier.ability: restrict to this ability for saves/checks (e.g. "Dexterity")
// grant_advantage means attackers/opponents have advantage vs the effect holder (Faerie Fire, Hold Person)
export const EFFECT_TEMPLATES = {
  bless: {
    name: 'Bless',
    concentration: true,
    duration_rounds: 10,
    modifiers: [
      { type: 'bonus_dice', roll_types: ['attack', 'save'], dice: '1d4' },
    ],
  },
  bane: {
    name: 'Bane',
    concentration: true,
    duration_rounds: 10,
    modifiers: [
      { type: 'subtract_dice', roll_types: ['attack', 'save'], dice: '1d4' },
    ],
  },
  hex: {
    name: 'Hex',
    concentration: true,
    duration_rounds: 60,
    modifiers: [
      { type: 'bonus_dice', roll_types: ['damage'], dice: '1d6', damage_type: 'necrotic' },
    ],
  },
  hunters_mark: {
    name: "Hunter's Mark",
    concentration: true,
    duration_rounds: 60,
    modifiers: [
      { type: 'bonus_dice', roll_types: ['damage'], dice: '1d6' },
    ],
  },
  faerie_fire: {
    name: 'Faerie Fire',
    concentration: true,
    duration_rounds: 10,
    modifiers: [
      { type: 'grant_advantage', roll_types: ['attack'] },
    ],
  },
  guidance: {
    name: 'Guidance',
    concentration: true,
    duration_rounds: 10,
    modifiers: [
      { type: 'bonus_dice', roll_types: ['ability_check'], dice: '1d4' },
    ],
  },
  haste: {
    name: 'Haste',
    concentration: true,
    duration_rounds: 10,
    modifiers: [
      { type: 'advantage', roll_types: ['save'], ability: 'Dexterity' },
    ],
  },
  slow: {
    name: 'Slow',
    concentration: true,
    duration_rounds: 10,
    modifiers: [
      { type: 'flat_penalty', roll_types: ['attack', 'save'], value: 2 },
    ],
  },
  hold_person: {
    name: 'Hold Person',
    concentration: true,
    duration_rounds: 10,
    modifiers: [
      { type: 'grant_advantage', roll_types: ['attack'] },
    ],
  },
};

// Load all active effects targeting a specific entity.
export async function loadEffectsForEntity(store, game_slug, target_type, target) {
  return store.list('active_effects', { game_slug, target_type, target });
}

// Delete all concentration effects whose owner is the given entity.
// Called when an entity drops concentration (clear_concentration).
export async function clearConcentrationEffects(store, game_slug, concentration_owner_type, concentration_owner) {
  return store.deleteWhere('active_effects', {
    game_slug,
    concentration_owner_type,
    concentration_owner,
    concentration: true,
  });
}

// Delete all effects in a game whose expires_at_round is <= upToRound.
// Returns the deleted effect records so callers can report what expired.
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

// Collect all applicable modifiers from a list of active effects for a given roll type.
// opts.ability — restrict advantage/disadvantage/dice mods to this ability (e.g. for saves)
// Returns:
//   advantageState: 'advantage' | 'disadvantage' | 'normal'
//   bonusDice: [{dice, negate, source, damage_type}]
//   flatBonus: number (positive = bonus, negative = penalty)
//   descriptions: string[] (human-readable summary of what applies)
//   grantAdvantage: boolean (target's effects grant attackers advantage vs it)
export function collectModifiers(effects, rollType, opts = {}) {
  const { ability } = opts;

  let advantageCount = 0;
  let disadvantageCount = 0;
  let grantAdvantageCount = 0;
  const bonusDice = [];
  let flatBonus = 0;
  const descriptions = [];

  for (const effect of effects) {
    for (const m of effect.modifiers ?? []) {
      if (!m.roll_types?.includes(rollType)) continue;
      if (m.ability && ability && m.ability.toLowerCase() !== ability.toLowerCase()) continue;

      switch (m.type) {
        case 'bonus_dice':
          bonusDice.push({ dice: m.dice, negate: false, source: effect.name, damage_type: m.damage_type ?? null });
          descriptions.push(`+${m.dice}${m.damage_type ? ` ${m.damage_type}` : ''} (${effect.name})`);
          break;
        case 'subtract_dice':
          bonusDice.push({ dice: m.dice, negate: true, source: effect.name });
          descriptions.push(`-${m.dice} (${effect.name})`);
          break;
        case 'flat_bonus':
          flatBonus += m.value ?? 0;
          descriptions.push(`+${m.value} (${effect.name})`);
          break;
        case 'flat_penalty':
          flatBonus -= m.value ?? 0;
          descriptions.push(`-${m.value} (${effect.name})`);
          break;
        case 'advantage':
          advantageCount++;
          descriptions.push(`advantage (${effect.name})`);
          break;
        case 'disadvantage':
          disadvantageCount++;
          descriptions.push(`disadvantage (${effect.name})`);
          break;
        case 'grant_advantage':
          grantAdvantageCount++;
          break;
      }
    }
  }

  const advantageState =
    advantageCount > 0 && disadvantageCount === 0 ? 'advantage' :
    disadvantageCount > 0 && advantageCount === 0 ? 'disadvantage' :
    'normal';

  return { advantageState, bonusDice, flatBonus, descriptions, grantAdvantage: grantAdvantageCount > 0 };
}
