import { vi, describe, it, expect, beforeEach } from 'vitest';
import { SupabaseStore } from '../../src/lib/supabase_store.js';
import applyDamage from '../../src/functions/apply_damage.js';
import { makeMockStore } from '../helpers/mock_store.js';
import { makeCharacter, makeNpc, fakeSettings } from '../helpers/fixtures.js';

vi.mock('../../src/lib/supabase_store.js', () => ({ SupabaseStore: vi.fn() }));
vi.mock('../../src/lib/migrations.js', () => ({ ensureMigrations: vi.fn().mockResolvedValue(undefined) }));

const GAME = 'test-game';

describe('apply_damage', () => {
  let store;

  beforeEach(() => {
    store = makeMockStore();
    vi.mocked(SupabaseStore).mockImplementation(function() { return store; });
  });

  it('returns error when character not found', async () => {
    store.get.mockResolvedValue(null);
    const result = await applyDamage(
      { game: GAME, entity_type: 'character', entity: 'nobody', amount: 10 },
      fakeSettings,
    );
    expect(result).toBe('No character found with identifier "nobody" in game "test-game".');
  });

  it('returns error when entity belongs to a different game', async () => {
    store.get.mockResolvedValue(makeCharacter({ game_slug: 'other-game' }));
    const result = await applyDamage(
      { game: GAME, entity_type: 'character', entity: 'aragorn', amount: 10 },
      fakeSettings,
    );
    expect(result).toContain('No character found');
  });

  it('applies untyped damage and reports HP', async () => {
    const char = makeCharacter({ current_hp: 30 });
    store.get.mockResolvedValue(char);

    const result = await applyDamage(
      { game: GAME, entity_type: 'character', entity: 'aragorn', amount: 10 },
      fakeSettings,
    );

    expect(store.patch).toHaveBeenCalledWith(
      'characters', char.id, { current_hp: 20, temporary_hp: 0 }, char.updated_at,
    );
    expect(result).toBe('Aragorn takes 10 damage. HP: 20/50.');
  });

  it('includes damage type in message when typed but unmodified', async () => {
    store.get.mockResolvedValue(makeCharacter({ current_hp: 30 }));
    const result = await applyDamage(
      { game: GAME, entity_type: 'character', entity: 'aragorn', amount: 5, damage_type: 'slashing' },
      fakeSettings,
    );
    expect(result).toContain('takes 5 slashing damage');
  });

  it('immunity: no damage applied, early message', async () => {
    const char = makeCharacter({ damage_immunities: ['fire'] });
    store.get.mockResolvedValue(char);

    const result = await applyDamage(
      { game: GAME, entity_type: 'character', entity: 'aragorn', amount: 15, damage_type: 'fire' },
      fakeSettings,
    );

    expect(store.patch).toHaveBeenCalledWith(
      'characters', char.id, { current_hp: 50, temporary_hp: 0 }, char.updated_at,
    );
    expect(result).toBe('Aragorn is immune to fire damage — no damage taken.');
  });

  it('resistance: halves damage (floor)', async () => {
    store.get.mockResolvedValue(makeCharacter({ current_hp: 50, damage_resistances: ['fire'] }));

    const result = await applyDamage(
      { game: GAME, entity_type: 'character', entity: 'aragorn', amount: 15, damage_type: 'fire' },
      fakeSettings,
    );

    expect(store.patch).toHaveBeenCalledWith(
      'characters', expect.any(String), { current_hp: 43, temporary_hp: 0 }, expect.any(String),
    );
    expect(result).toContain('resistant to fire: 15 → 7 damage');
    expect(result).toContain('HP: 43/50.');
  });

  it('vulnerability: doubles damage', async () => {
    store.get.mockResolvedValue(makeCharacter({ current_hp: 50, damage_vulnerabilities: ['fire'] }));

    const result = await applyDamage(
      { game: GAME, entity_type: 'character', entity: 'aragorn', amount: 5, damage_type: 'fire' },
      fakeSettings,
    );

    expect(store.patch).toHaveBeenCalledWith(
      'characters', expect.any(String), { current_hp: 40, temporary_hp: 0 }, expect.any(String),
    );
    expect(result).toContain('vulnerable to fire: 5 → 10 damage');
  });

  it('temp HP absorbs damage before current HP', async () => {
    store.get.mockResolvedValue(makeCharacter({ current_hp: 30, temporary_hp: 5 }));

    const result = await applyDamage(
      { game: GAME, entity_type: 'character', entity: 'aragorn', amount: 8 },
      fakeSettings,
    );

    expect(store.patch).toHaveBeenCalledWith(
      'characters', expect.any(String), { current_hp: 27, temporary_hp: 0 }, expect.any(String),
    );
    expect(result).toContain('(5 absorbed by temporary HP)');
    expect(result).toContain('HP: 27/50.');
  });

  it('temp HP partially absorbs damage, remainder shown', async () => {
    store.get.mockResolvedValue(makeCharacter({ current_hp: 30, temporary_hp: 15 }));

    const result = await applyDamage(
      { game: GAME, entity_type: 'character', entity: 'aragorn', amount: 10 },
      fakeSettings,
    );

    expect(store.patch).toHaveBeenCalledWith(
      'characters', expect.any(String), { current_hp: 30, temporary_hp: 5 }, expect.any(String),
    );
    expect(result).toContain('Temp HP: 5');
  });

  it('HP floor is 0, character goes unconscious', async () => {
    store.get.mockResolvedValue(makeCharacter({ current_hp: 5 }));

    const result = await applyDamage(
      { game: GAME, entity_type: 'character', entity: 'aragorn', amount: 20 },
      fakeSettings,
    );

    expect(result).toContain('HP: 0/50.');
    expect(result).toContain('Unconscious — rolling death saves.');
  });

  it('NPC at 0 HP is Dead, not Unconscious', async () => {
    store.get.mockResolvedValue(makeNpc({ current_hp: 3 }));

    const result = await applyDamage(
      { game: GAME, entity_type: 'npc', entity: 'goblin', amount: 10 },
      fakeSettings,
    );

    expect(result).toContain('Dead.');
    expect(result).not.toContain('Unconscious');
  });

  it('retries when patch signals a concurrent update (null return)', async () => {
    const char = makeCharacter({ current_hp: 30 });
    store.get.mockResolvedValue(char);
    store.patch
      .mockResolvedValueOnce(null)
      .mockResolvedValue({ id: char.id });

    const result = await applyDamage(
      { game: GAME, entity_type: 'character', entity: 'aragorn', amount: 10 },
      fakeSettings,
    );

    expect(store.get).toHaveBeenCalledTimes(2);
    expect(store.patch).toHaveBeenCalledTimes(2);
    expect(result).toContain('takes 10 damage');
  });

  it('gives up after MAX_RETRIES concurrent updates', async () => {
    store.get.mockResolvedValue(makeCharacter());
    store.patch.mockResolvedValue(null);

    const result = await applyDamage(
      { game: GAME, entity_type: 'character', entity: 'aragorn', amount: 10 },
      fakeSettings,
    );

    expect(store.patch).toHaveBeenCalledTimes(5);
    expect(result).toMatch(/Could not apply damage.*after 5 attempts/);
  });
});
