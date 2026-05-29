// Shared saving-throw helpers used by roll_saves and advance_turn so the
// two stay consistent (ability lookup, proficiency match, bonus math).

export const ABILITY_COLUMNS = {
  Strength: 'strength',
  Dexterity: 'dexterity',
  Constitution: 'constitution',
  Intelligence: 'intelligence',
  Wisdom: 'wisdom',
  Charisma: 'charisma',
};

// Compute an entity's saving-throw bonus for the given ability.
// Unknown abilities fall back to a +0 modifier with no proficiency.
export function saveBonus(record, ability) {
  const abilityCol = ABILITY_COLUMNS[ability];
  const score = (abilityCol ? record[abilityCol] : undefined) ?? 10;
  const mod = Math.floor((score - 10) / 2);
  const pb = record.pb ?? 0;
  const proficiencies = record.proficiencies ?? [];
  const isProficient = proficiencies.some(
    p => p.toLowerCase() === `${ability.toLowerCase()} saving throws`
  );
  return { bonus: mod + (isProficient ? pb : 0), isProficient };
}

export function signedBonus(bonus) {
  return bonus >= 0 ? `+${bonus}` : `${bonus}`;
}
