import { SupabaseStore } from '../lib/supabase_store.js';
import { ensureMigrations } from '../lib/migrations.js';

const IMMUTABLE = new Set(['id', 'game_slug', 'slug', 'created_at', 'updated_at']);

function toSlug(name) {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

export default async function upsert_npc(params, userSettings) {
  await ensureMigrations(userSettings);

  const { game, name, slug: explicitSlug, ...rest } = params;
  const slug = explicitSlug ?? toSlug(name);

  const store = new SupabaseStore(userSettings.externalDbUrl, userSettings.externalDbKey);

  const gameRecord = await store.get('games', game);
  if (!gameRecord) {
    return `No game found with slug "${game}". Create it first with dnd5e24_create_game, or check the slug.`;
  }

  const existing = await store.get('npcs', slug, game);

  if (existing && existing.game_slug === game) {
    const patch = Object.fromEntries(
      Object.entries({ name, ...rest }).filter(([k, v]) => !IMMUTABLE.has(k) && v !== undefined)
    );
    if (Object.keys(patch).length === 0) {
      return `NPC "${existing.name}" (slug: "${slug}") is already up to date.`;
    }
    await store.patch('npcs', existing.id, patch);
    return `NPC "${existing.name}" (slug: "${slug}") updated in game "${game}".`;
  }

  const {
    species, size, creature_type, alignment, ac, max_hp, current_hp, temporary_hp,
    speeds, strength, dexterity, constitution, intelligence, wisdom, charisma, pb,
    proficiencies, expertise, weapon_mastery, spellcasting_ability, spells_known,
    spells_prepared, spell_slots_total, spell_slots_usable, senses, languages, cr,
    damage_resistances, damage_immunities, damage_vulnerabilities, condition_immunities,
    traits, actions, bonus_actions, reactions, legendary_resistances, legendary_actions,
    lair_actions, equipment, notes, gold,
  } = rest;

  const npc = {
    id: crypto.randomUUID(),
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
    gold: gold ?? 0,
  };

  await store.insert('npcs', npc);
  return `NPC "${name}" created with slug "${slug}" in game "${game}".`;
}
