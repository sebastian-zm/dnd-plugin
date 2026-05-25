import { vi, describe, it, expect, beforeEach } from 'vitest';
import { SupabaseStore } from '../../src/lib/supabase_store.js';
import rest from '../../src/functions/rest.js';
import { makeMockStore } from '../helpers/mock_store.js';
import { makeGame, makeCharacter, fakeSettings } from '../helpers/fixtures.js';

vi.mock('../../src/lib/supabase_store.js', () => ({ SupabaseStore: vi.fn() }));
vi.mock('../../src/lib/migrations.js', () => ({ ensureMigrations: vi.fn().mockResolvedValue(undefined) }));

const GAME = 'test-game';

describe('rest', () => {
  let store;

  beforeEach(() => {
    store = makeMockStore();
    vi.mocked(SupabaseStore).mockImplementation(function() { return store; });
  });

  it('returns error when game not found', async () => {
    store.get.mockResolvedValue(null);
    const result = await rest({ game: GAME, rest_type: 'long' }, fakeSettings);
    expect(result).toBe('No game found with slug "test-game".');
  });

  it('returns error when no characters in game', async () => {
    store.get.mockResolvedValue(makeGame());
    store.list.mockResolvedValue([]);
    const result = await rest({ game: GAME, rest_type: 'long' }, fakeSettings);
    expect(result).toBe('No characters found in game "test-game".');
  });

  describe('long rest', () => {
    it('restores HP to max', async () => {
      const char = makeCharacter({ current_hp: 20, temporary_hp: 0, conditions: [], spell_slots_total: {} });
      store.get.mockResolvedValue(makeGame());
      store.list.mockResolvedValue([char]);

      const result = await rest({ game: GAME, rest_type: 'long' }, fakeSettings);

      expect(store.patch).toHaveBeenCalledWith(
        'characters', char.id,
        { current_hp: 50, temporary_hp: 0, spell_slots_usable: {}, conditions: [], death_save_successes: 0, death_save_failures: 0, resources: [] },
      );
      expect(result).toContain('Long rest complete.');
      expect(result).toContain('Aragorn: HP restored to 50');
    });

    it('reports spell slot restoration', async () => {
      const char = makeCharacter({
        current_hp: 10, temporary_hp: 0, conditions: [],
        spell_slots_total: { '1': 4, '2': 3 },
      });
      store.get.mockResolvedValue(makeGame());
      store.list.mockResolvedValue([char]);

      const result = await rest({ game: GAME, rest_type: 'long' }, fakeSettings);
      expect(result).toContain('all spell slots restored');
    });

    it('reports cleared temp HP', async () => {
      const char = makeCharacter({ current_hp: 50, temporary_hp: 8, conditions: [], spell_slots_total: {} });
      store.get.mockResolvedValue(makeGame());
      store.list.mockResolvedValue([char]);

      const result = await rest({ game: GAME, rest_type: 'long' }, fakeSettings);
      expect(result).toContain('8 temp HP cleared');
    });

    it('reports cleared conditions', async () => {
      const char = makeCharacter({ current_hp: 50, temporary_hp: 0, conditions: ['Poisoned', 'Frightened'], spell_slots_total: {} });
      store.get.mockResolvedValue(makeGame());
      store.list.mockResolvedValue([char]);

      const result = await rest({ game: GAME, rest_type: 'long' }, fakeSettings);
      expect(result).toContain('conditions cleared (Poisoned, Frightened)');
    });
  });

  describe('short rest', () => {
    it('restores Pact Magic for Warlock', async () => {
      const warlock = makeCharacter({
        name: 'Gandalf', class_name: 'Warlock',
        spell_slots_total: { '1': 2 }, spell_slots_usable: { '1': 0 },
        conditions: [], temporary_hp: 0,
      });
      store.get.mockResolvedValue(makeGame());
      store.list.mockResolvedValue([warlock]);

      const result = await rest({ game: GAME, rest_type: 'short' }, fakeSettings);

      expect(store.patch).toHaveBeenCalledWith(
        'characters', warlock.id, { spell_slots_usable: { '1': 2 } },
      );
      expect(result).toContain('Short rest complete.');
      expect(result).toContain('Gandalf: Pact Magic restored (2 slots).');
    });

    it('tells non-Warlock to spend Hit Dice', async () => {
      const ranger = makeCharacter({ name: 'Aragorn', class_name: 'Ranger' });
      store.get.mockResolvedValue(makeGame());
      store.list.mockResolvedValue([ranger]);

      const result = await rest({ game: GAME, rest_type: 'short' }, fakeSettings);

      expect(store.patch).not.toHaveBeenCalled();
      expect(result).toContain('Aragorn: no automated changes (spend Hit Dice to recover HP).');
    });

    it('handles mixed party', async () => {
      const warlock = makeCharacter({ name: 'Hexblade', class_name: 'Warlock', spell_slots_total: { '1': 1 } });
      const fighter = makeCharacter({ name: 'Thorin', class_name: 'Fighter', spell_slots_total: {} });
      store.get.mockResolvedValue(makeGame());
      store.list.mockResolvedValue([warlock, fighter]);

      const result = await rest({ game: GAME, rest_type: 'short' }, fakeSettings);
      expect(result).toContain('Hexblade: Pact Magic restored');
      expect(result).toContain('Thorin: no automated changes');
    });
  });
});
