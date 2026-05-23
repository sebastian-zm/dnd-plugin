import { SupabaseStore } from '../lib/supabase_store.js';

export default async function create_character(params, userSettings) {
  const {
    game,
    slug,
    name,
    player,
    species,
    class_name,
    subclass,
    level,
    background,
    ac,
    max_hp,
    current_hp,
    temporary_hp,
    speeds,
    strength,
    dexterity,
    constitution,
    intelligence,
    wisdom,
    charisma,
    pb,
    proficiencies,
    expertise,
    weapon_mastery,
    spellcasting_ability,
    spells_known,
    spells_prepared,
    spell_slots_total,
    spell_slots_usable,
    senses,
    languages,
    damage_resistances,
    damage_immunities,
    condition_immunities,
    features,
    equipment,
    notes,
  } = params;

  const id = crypto.randomUUID();

  const character = {
    id,
    game_slug: game,
    slug,
    name,
    player,
    species,
    class_name,
    subclass,
    level: level ?? 1,
    background,
    ac,
    max_hp,
    current_hp: current_hp ?? max_hp,
    temporary_hp: temporary_hp ?? 0,
    speeds,
    strength,
    dexterity,
    constitution,
    intelligence,
    wisdom,
    charisma,
    pb,
    proficiencies: proficiencies ?? [],
    expertise: expertise ?? [],
    weapon_mastery: weapon_mastery ?? [],
    spellcasting_ability,
    spells_known: spells_known ?? [],
    spells_prepared: spells_prepared ?? [],
    spell_slots_total: spell_slots_total ?? {},
    spell_slots_usable: spell_slots_usable ?? spell_slots_total ?? {},
    senses,
    languages: languages ?? [],
    damage_resistances: damage_resistances ?? [],
    damage_immunities: damage_immunities ?? [],
    condition_immunities: condition_immunities ?? [],
    features: features ?? [],
    equipment: equipment ?? [],
    notes,
  };

  const store = new SupabaseStore(userSettings.externalDbUrl, userSettings.externalDbKey);
  try {
    await store.insert('characters', character);
  } catch (err) {
    if (err.code === '42P01' || err.code === '42703') {
      return `Schema error: ${err.message}. Please call dnd5e24_run_migrations then retry.`;
    }
    if (err.code === '23505') {
      return `A character with slug "${slug}" already exists in game "${game}".`;
    }
    throw err;
  }

  return `Character "${name}" created with slug "${slug}" in game "${game}".`;
}
