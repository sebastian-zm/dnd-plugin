import { describe, it, expect } from 'vitest';
import {
  levelFromXp, xpForNextLevel, pbForLevel, abilityMod,
  computeDerived, decorateCharacter, decorateNpc,
} from '../../src/lib/derived.js';

describe('levelFromXp', () => {
  it('returns 1 for 0 XP', () => expect(levelFromXp(0)).toBe(1));
  it('returns 1 for 299 XP', () => expect(levelFromXp(299)).toBe(1));
  it('returns 2 at exactly 300 XP', () => expect(levelFromXp(300)).toBe(2));
  it('returns 5 at exactly 6500 XP', () => expect(levelFromXp(6500)).toBe(5));
  it('returns 20 at max XP threshold', () => expect(levelFromXp(355000)).toBe(20));
  it('returns 20 for XP above max', () => expect(levelFromXp(999999)).toBe(20));
  it('returns null for negative XP', () => expect(levelFromXp(-1)).toBeNull());
  it('returns null for non-number', () => expect(levelFromXp('abc')).toBeNull());
});

describe('xpForNextLevel', () => {
  it('returns 300 for level 1', () => expect(xpForNextLevel(1)).toBe(300));
  it('returns 6500 for level 4', () => expect(xpForNextLevel(4)).toBe(6500));
  it('returns 355000 for level 19', () => expect(xpForNextLevel(19)).toBe(355000));
  it('returns null at level 20', () => expect(xpForNextLevel(20)).toBeNull());
  it('returns null for null input', () => expect(xpForNextLevel(null)).toBeNull());
});

describe('pbForLevel', () => {
  it.each([
    [1, 2], [4, 2],
    [5, 3], [8, 3],
    [9, 4], [12, 4],
    [13, 5], [16, 5],
    [17, 6], [20, 6],
  ])('level %i → pb %i', (level, expected) => {
    expect(pbForLevel(level)).toBe(expected);
  });
  it('returns null for 0', () => expect(pbForLevel(0)).toBeNull());
  it('returns null for null', () => expect(pbForLevel(null)).toBeNull());
});

describe('abilityMod', () => {
  it.each([
    [1, -5], [8, -1], [9, -1], [10, 0], [11, 0],
    [12, 1], [14, 2], [18, 4], [20, 5], [30, 10],
  ])('score %i → mod %i', (score, expected) => {
    expect(abilityMod(score)).toBe(expected);
  });
  it('returns null for non-number', () => expect(abilityMod('str')).toBeNull());
});

describe('computeDerived', () => {
  it('returns null for null record', () => expect(computeDerived(null)).toBeNull());

  it('computes ability modifiers', () => {
    const d = computeDerived({
      strength: 18, dexterity: 14, constitution: 16,
      intelligence: 10, wisdom: 12, charisma: 8,
    });
    expect(d.ability_modifiers).toEqual({ str: 4, dex: 2, con: 3, int: 0, wis: 1, cha: -1 });
  });

  it('sets initiative from dex mod', () => {
    const d = computeDerived({ dexterity: 16 });
    expect(d.initiative).toBe(3);
  });

  it('applies proficiency bonus to saves and skills', () => {
    const d = computeDerived({
      strength: 18, dexterity: 14, wisdom: 12,
      level: 5,
      proficiencies: ['Athletics', 'Perception', 'Strength Save'],
      expertise: ['Perception'],
    });
    expect(d.pb).toBe(3);
    expect(d.save_modifiers.str).toBe(7);   // 4 + 3
    expect(d.save_modifiers.dex).toBe(2);   // 2, not proficient
    expect(d.skill_modifiers['Athletics']).toBe(7);    // 4 + 3
    expect(d.skill_modifiers['Perception']).toBe(7);   // 1 + 3*2 expertise
    expect(d.skill_modifiers['Acrobatics']).toBe(2);   // 2, no proficiency
  });

  it('computes passive perception', () => {
    const d = computeDerived({
      wisdom: 12,
      level: 5,
      proficiencies: ['Perception'],
      expertise: [],
    });
    expect(d.passive_perception).toBe(14); // 10 + (1 + 3)
  });

  it('computes spell save DC and attack bonus', () => {
    const d = computeDerived({
      intelligence: 18,
      level: 5,
      spellcasting_ability: 'Intelligence',
      proficiencies: [],
      expertise: [],
    });
    expect(d.spell_save_dc).toBe(15);      // 8 + 3 + 4
    expect(d.spell_attack_bonus).toBe(7);  // 3 + 4
  });

  it('includes level and XP fields when includeLevel is true', () => {
    const d = computeDerived({ level: 3, xp: 1000 }, { includeLevel: true });
    expect(d.level).toBe(3);
    expect(d.xp_for_next_level).toBe(2700);
    expect(d.xp_to_next_level).toBe(1700);
  });

  it('surfaces xp-derived level mismatch', () => {
    // stored level 3, but XP is already enough for level 4
    const d = computeDerived({ level: 3, xp: 2700 }, { includeLevel: true });
    expect(d.level_from_xp).toBe(4);
  });

  it('uses stored pb over derived pb', () => {
    const d = computeDerived({ level: 1, pb: 10, proficiencies: [], expertise: [] });
    expect(d.pb).toBe(10);
  });
});

describe('decorateCharacter', () => {
  it('returns null for null', () => expect(decorateCharacter(null)).toBeNull());

  it('adds derived field with includeLevel', () => {
    const char = { strength: 10, dexterity: 10, level: 1, proficiencies: [], expertise: [], xp: 0 };
    const result = decorateCharacter(char);
    expect(result.derived).toBeDefined();
    expect(result.derived.level).toBe(1);
    expect(result.strength).toBe(10); // original fields preserved
  });
});

describe('decorateNpc', () => {
  it('returns null for null', () => expect(decorateNpc(null)).toBeNull());

  it('adds derived field without level tracking', () => {
    const npc = { strength: 18, dexterity: 10, pb: 4, proficiencies: [], expertise: [] };
    const result = decorateNpc(npc);
    expect(result.derived.ability_modifiers.str).toBe(4);
    expect(result.derived.level).toBeUndefined();
  });
});
