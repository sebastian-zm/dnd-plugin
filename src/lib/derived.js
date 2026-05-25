// D&D 2024 XP thresholds per level (index = level).
const XP_THRESHOLDS = [
  0, 0, 300, 900, 2700, 6500, 14000, 23000, 34000, 48000, 64000,
  85000, 100000, 120000, 140000, 165000, 195000, 225000, 265000, 305000, 355000
];

export function levelFromXp(xp) {
  if (typeof xp !== 'number' || xp < 0) return null;
  let level = 1;
  for (let l = 20; l >= 1; l--) {
    if (xp >= XP_THRESHOLDS[l]) { level = l; break; }
  }
  return level;
}

export function xpForNextLevel(level) {
  if (level == null || level >= 20) return null;
  return XP_THRESHOLDS[level + 1];
}

export function pbForLevel(level) {
  if (!level || level < 1) return null;
  return Math.ceil(level / 4) + 1;
}

export function abilityMod(score) {
  if (typeof score !== 'number') return null;
  return Math.floor((score - 10) / 2);
}

const ABILITY_KEYS = ['strength', 'dexterity', 'constitution', 'intelligence', 'wisdom', 'charisma'];
const ABILITY_SHORT = { strength: 'str', dexterity: 'dex', constitution: 'con', intelligence: 'int', wisdom: 'wis', charisma: 'cha' };

const SKILL_ABILITY = {
  'Acrobatics': 'dexterity', 'Animal Handling': 'wisdom', 'Arcana': 'intelligence',
  'Athletics': 'strength', 'Deception': 'charisma', 'History': 'intelligence',
  'Insight': 'wisdom', 'Intimidation': 'charisma', 'Investigation': 'intelligence',
  'Medicine': 'wisdom', 'Nature': 'intelligence', 'Perception': 'wisdom',
  'Performance': 'charisma', 'Persuasion': 'charisma', 'Religion': 'intelligence',
  'Sleight of Hand': 'dexterity', 'Stealth': 'dexterity', 'Survival': 'wisdom'
};

const SAVE_KEYS = {
  'Strength Save': 'strength', 'Dexterity Save': 'dexterity', 'Constitution Save': 'constitution',
  'Intelligence Save': 'intelligence', 'Wisdom Save': 'wisdom', 'Charisma Save': 'charisma'
};

function abilityMods(record) {
  const mods = {};
  for (const key of ABILITY_KEYS) {
    const m = abilityMod(record[key]);
    if (m !== null) mods[ABILITY_SHORT[key]] = m;
  }
  return mods;
}

function saveMods(record, pb, profSet) {
  const out = {};
  for (const [profName, abilityKey] of Object.entries(SAVE_KEYS)) {
    const m = abilityMod(record[abilityKey]);
    if (m === null) continue;
    out[ABILITY_SHORT[abilityKey]] = m + (pb && profSet.has(profName) ? pb : 0);
  }
  return out;
}

function skillMods(record, pb, profSet, expertiseSet) {
  const out = {};
  for (const [skill, abilityKey] of Object.entries(SKILL_ABILITY)) {
    const m = abilityMod(record[abilityKey]);
    if (m === null) continue;
    let bonus = m;
    if (pb) {
      if (expertiseSet.has(skill)) bonus += pb * 2;
      else if (profSet.has(skill)) bonus += pb;
    }
    out[skill] = bonus;
  }
  return out;
}

export function computeDerived(record, opts = {}) {
  if (!record) return null;
  const derived = {};

  // Level / XP (characters only)
  if (opts.includeLevel) {
    const storedLevel = record.level;
    const xpLevel = levelFromXp(record.xp);
    const level = storedLevel ?? xpLevel ?? null;
    if (level != null) derived.level = level;
    if (xpLevel != null && storedLevel != null && xpLevel !== storedLevel) {
      derived.level_from_xp = xpLevel;
    }
    if (level != null && level < 20) {
      const next = xpForNextLevel(level);
      derived.xp_for_next_level = next;
      if (typeof record.xp === 'number') {
        derived.xp_to_next_level = Math.max(0, next - record.xp);
      }
    }
  }

  // Proficiency bonus: prefer stored, else derive from level
  const level = record.level ?? (opts.includeLevel ? levelFromXp(record.xp) : null);
  const pb = record.pb ?? pbForLevel(level);
  if (pb != null) derived.pb = pb;

  // Ability modifiers
  const mods = abilityMods(record);
  if (Object.keys(mods).length > 0) derived.ability_modifiers = mods;

  // Initiative = dex mod
  if (mods.dex != null) derived.initiative = mods.dex;

  // Saves and skills
  const profSet = new Set(record.proficiencies ?? []);
  const expertiseSet = new Set(record.expertise ?? []);
  const saves = saveMods(record, pb, profSet);
  if (Object.keys(saves).length > 0) derived.save_modifiers = saves;
  const skills = skillMods(record, pb, profSet, expertiseSet);
  if (Object.keys(skills).length > 0) derived.skill_modifiers = skills;

  // Passive Perception = 10 + Perception modifier
  if (skills.Perception != null) derived.passive_perception = 10 + skills.Perception;

  // Spell save DC / attack bonus
  if (record.spellcasting_ability && pb != null) {
    const key = record.spellcasting_ability.toLowerCase();
    const m = abilityMod(record[key]);
    if (m != null) {
      derived.spell_save_dc = 8 + pb + m;
      derived.spell_attack_bonus = pb + m;
    }
  }

  return derived;
}

export function decorateCharacter(record) {
  if (!record) return record;
  return { ...record, derived: computeDerived(record, { includeLevel: true }) };
}

export function decorateNpc(record) {
  if (!record) return record;
  return { ...record, derived: computeDerived(record, { includeLevel: false }) };
}
