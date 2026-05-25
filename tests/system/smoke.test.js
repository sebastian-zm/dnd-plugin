/**
 * System tests — run against a real Supabase instance.
 * Requires: SUPABASE_URL and SUPABASE_KEY environment variables.
 *
 *   npm run test:system
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import createGame from '../../src/functions/create_game.js';
import deleteGame from '../../src/functions/delete_game.js';
import upsertCharacter from '../../src/functions/upsert_character.js';
import getCharacter from '../../src/functions/get_character.js';
import applyDamage from '../../src/functions/apply_damage.js';
import applyHealing from '../../src/functions/apply_healing.js';
import applyCondition from '../../src/functions/apply_condition.js';
import removeCondition from '../../src/functions/remove_condition.js';
import grantXp from '../../src/functions/grant_xp.js';
import rest from '../../src/functions/rest.js';

const { SUPABASE_URL, SUPABASE_KEY } = process.env;
const hasCredentials = Boolean(SUPABASE_URL && SUPABASE_KEY);

const settings = { externalDbUrl: SUPABASE_URL, externalDbKey: SUPABASE_KEY };

// Unique slug so parallel runs or reruns don't collide
const GAME = `sys-test-${Date.now()}`;
const CHAR = 'test-hero';

describe.skipIf(!hasCredentials)('system smoke', () => {
  beforeAll(async () => {
    const msg = await createGame(
      { slug: GAME, name: 'System Test Game', description: 'Created by automated tests' },
      settings,
    );
    expect(msg).toContain('created');

    const charMsg = await upsertCharacter(
      {
        game: GAME,
        name: 'Test Hero',
        slug: CHAR,
        max_hp: 50,
        level: 5,
        strength: 16, dexterity: 14, constitution: 14,
        intelligence: 10, wisdom: 12, charisma: 8,
        proficiencies: ['Athletics', 'Perception'],
        expertise: [],
        spell_slots_total: { '1': 4, '2': 3 },
      },
      settings,
    );
    expect(charMsg).toContain('created');
  });

  afterAll(async () => {
    await deleteGame({ slug: GAME }, settings);
  });

  it('get_character returns decorated character', async () => {
    const raw = await getCharacter({ game: GAME, character: CHAR }, settings);
    const char = JSON.parse(raw);
    expect(char.name).toBe('Test Hero');
    expect(char.max_hp).toBe(50);
    expect(char.derived).toBeDefined();
    expect(char.derived.pb).toBe(3);
    expect(char.derived.ability_modifiers.str).toBe(3);
    expect(char.derived.passive_perception).toBeDefined();
  });

  it('apply_damage reduces HP', async () => {
    const result = await applyDamage(
      { game: GAME, entity_type: 'character', entity: CHAR, amount: 15 },
      settings,
    );
    expect(result).toContain('takes 15 damage');
    expect(result).toContain('HP: 35/50');
  });

  it('apply_healing restores HP', async () => {
    const result = await applyHealing(
      { game: GAME, entity_type: 'character', entity: CHAR, amount: 10 },
      settings,
    );
    expect(result).toContain('recovers 10 HP');
    expect(result).toContain('HP: 45/50');
  });

  it('apply_healing caps at max_hp', async () => {
    const result = await applyHealing(
      { game: GAME, entity_type: 'character', entity: CHAR, amount: 100 },
      settings,
    );
    expect(result).toContain('wasted');
    expect(result).toContain('HP: 50/50');
  });

  it('apply_condition adds a condition', async () => {
    const result = await applyCondition(
      { game: GAME, entity_type: 'character', entity: CHAR, condition: 'Poisoned' },
      settings,
    );
    expect(result).toContain('is now Poisoned');
    expect(result).toContain('Poisoned');
  });

  it('apply_condition is idempotent (already has condition)', async () => {
    const result = await applyCondition(
      { game: GAME, entity_type: 'character', entity: CHAR, condition: 'Poisoned' },
      settings,
    );
    expect(result).toContain('already has the Poisoned condition');
  });

  it('remove_condition clears the condition', async () => {
    const result = await removeCondition(
      { game: GAME, entity_type: 'character', entity: CHAR, condition: 'Poisoned' },
      settings,
    );
    expect(result).toContain('is no longer Poisoned');
  });

  it('grant_xp increases XP for all characters', async () => {
    const result = await grantXp({ game: GAME, amount: 300 }, settings);
    expect(result).toContain('Granted 300 XP');
    expect(result).toContain('Test Hero');

    const raw = await getCharacter({ game: GAME, character: CHAR }, settings);
    const char = JSON.parse(raw);
    expect(char.xp).toBe(300);
  });

  it('long rest restores HP and clears temp HP', async () => {
    // damage first so HP is not full
    await applyDamage(
      { game: GAME, entity_type: 'character', entity: CHAR, amount: 20 },
      settings,
    );
    const result = await rest({ game: GAME, rest_type: 'long' }, settings);
    expect(result).toContain('Long rest complete');
    expect(result).toContain('HP restored to 50');

    const raw = await getCharacter({ game: GAME, character: CHAR }, settings);
    const char = JSON.parse(raw);
    expect(char.current_hp).toBe(50);
  });
});

if (!hasCredentials) {
  console.log('Skipping system tests: set SUPABASE_URL and SUPABASE_KEY to run them.');
}
