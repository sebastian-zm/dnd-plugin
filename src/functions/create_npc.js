import { SupabaseStore } from '../lib/supabase_store.js';

export default async function create_npc(params, userSettings) {
  const {
    game,
    slug,
    name,
    species,
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
    senses,
    languages,
    cr,
    proficiencies,
    expertise,
    weapon_mastery,
    spellcasting_ability,
    spells_known,
    spells_prepared,
    spell_slots_total,
    spell_slots_usable,
    size,
    creature_type,
    alignment,
    damage_resistances,
    damage_immunities,
    damage_vulnerabilities,
    condition_immunities,
    traits,
    actions,
    bonus_actions,
    reactions,
    legendary_resistances,
    legendary_actions,
    lair_actions,
    equipment,
    notes,
  } = params;

  const id = crypto.randomUUID();

  const npc = {
    id,
    game_slug: game,
    slug,
    name,
    species,
    size,
    creature_type,
    alignment,
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
    cr,
    damage_resistances: damage_resistances ?? [],
    damage_immunities: damage_immunities ?? [],
    damage_vulnerabilities: damage_vulnerabilities ?? [],
    condition_immunities: condition_immunities ?? [],
    traits: traits ?? [],
    actions: actions ?? [],
    bonus_actions: bonus_actions ?? [],
    reactions: reactions ?? [],
    legendary_resistances: legendary_resistances ?? 0,
    legendary_actions: legendary_actions ?? [],
    lair_actions: lair_actions ?? [],
    equipment: equipment ?? [],
    notes,
  };

  const store = new SupabaseStore(userSettings.externalDbUrl, userSettings.externalDbKey);
  try {
    const gameRecord = await store.get('games', game);
    if (!gameRecord) {
      return `No game found with slug "${game}". Create it first with dnd5e24_create_game, or check the slug.`;
    }
    await store.insert('npcs', npc);
  } catch (err) {
    if (err.code === '42P01' || err.code === '42703') {
      return `Schema error: ${err.message}. Please call dnd5e24_run_migrations then retry.`;
    }
    if (err.code === '23505') {
      return `An NPC with slug "${slug}" already exists in game "${game}".`;
    }
    throw err;
  }

  return `NPC "${name}" created with slug "${slug}" in game "${game}".`;
}
