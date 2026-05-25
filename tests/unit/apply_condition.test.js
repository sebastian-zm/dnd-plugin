import { vi, describe, it, expect, beforeEach } from 'vitest';
import { SupabaseStore } from '../../src/lib/supabase_store.js';
import applyCondition from '../../src/functions/apply_condition.js';
import { makeMockStore } from '../helpers/mock_store.js';
import { makeGame, makeCharacter, fakeSettings } from '../helpers/fixtures.js';

vi.mock('../../src/lib/supabase_store.js', () => ({ SupabaseStore: vi.fn() }));
vi.mock('../../src/lib/migrations.js', () => ({ ensureMigrations: vi.fn().mockResolvedValue(undefined) }));

const GAME = 'test-game';
const BASE_PARAMS = { game: GAME, entity_type: 'character', entity: 'aragorn', condition: 'Poisoned' };

describe('apply_condition', () => {
  let store;

  beforeEach(() => {
    store = makeMockStore();
    vi.mocked(SupabaseStore).mockImplementation(function() { return store; });
  });

  it('returns error when game not found', async () => {
    store.get.mockResolvedValue(null);
    const result = await applyCondition(BASE_PARAMS, fakeSettings);
    expect(result).toBe('No game found with slug "test-game".');
  });

  it('returns error when entity not found in game', async () => {
    store.get.mockImplementation((table) =>
      table === 'games' ? Promise.resolve(makeGame()) : Promise.resolve(null),
    );
    const result = await applyCondition(BASE_PARAMS, fakeSettings);
    expect(result).toBe('No character found with identifier "aragorn" in game "test-game".');
  });

  it('respects direct condition immunity', async () => {
    const char = makeCharacter({ condition_immunities: ['Poisoned'] });
    store.get.mockImplementation((table) =>
      table === 'games' ? Promise.resolve(makeGame()) : Promise.resolve(char),
    );
    const result = await applyCondition(BASE_PARAMS, fakeSettings);
    expect(result).toBe('Aragorn is immune to Poisoned and cannot be affected.');
    expect(store.patch).not.toHaveBeenCalled();
  });

  it('respects Exhaustion base-condition immunity for numbered Exhaustion', async () => {
    const char = makeCharacter({ condition_immunities: ['Exhaustion'] });
    store.get.mockImplementation((table) =>
      table === 'games' ? Promise.resolve(makeGame()) : Promise.resolve(char),
    );
    const result = await applyCondition(
      { ...BASE_PARAMS, condition: 'Exhaustion 1' },
      fakeSettings,
    );
    expect(result).toBe('Aragorn is immune to Exhaustion 1 and cannot be affected.');
  });

  it('returns message when entity already has the condition', async () => {
    const char = makeCharacter({ conditions: ['Poisoned'] });
    store.get.mockImplementation((table) =>
      table === 'games' ? Promise.resolve(makeGame()) : Promise.resolve(char),
    );
    const result = await applyCondition(BASE_PARAMS, fakeSettings);
    expect(result).toBe('Aragorn already has the Poisoned condition.');
    expect(store.patch).not.toHaveBeenCalled();
  });

  it('applies condition and reports active conditions', async () => {
    const char = makeCharacter({ conditions: ['Blinded'] });
    store.get.mockImplementation((table) =>
      table === 'games' ? Promise.resolve(makeGame()) : Promise.resolve(char),
    );

    const result = await applyCondition(BASE_PARAMS, fakeSettings);

    expect(store.patch).toHaveBeenCalledWith(
      'characters', char.id, { conditions: ['Blinded', 'Poisoned'] }, char.updated_at,
    );
    expect(result).toBe('Aragorn is now Poisoned. Active conditions: Blinded, Poisoned.');
  });

  it('retries on concurrent update', async () => {
    const char = makeCharacter({ conditions: [] });
    store.get.mockImplementation((table) =>
      table === 'games' ? Promise.resolve(makeGame()) : Promise.resolve(char),
    );
    store.patch
      .mockResolvedValueOnce(null)
      .mockResolvedValue({ id: char.id });

    const result = await applyCondition(BASE_PARAMS, fakeSettings);

    expect(store.patch).toHaveBeenCalledTimes(2);
    expect(result).toContain('is now Poisoned');
  });

  it('gives up after MAX_RETRIES', async () => {
    const char = makeCharacter({ conditions: [] });
    store.get.mockImplementation((table) =>
      table === 'games' ? Promise.resolve(makeGame()) : Promise.resolve(char),
    );
    store.patch.mockResolvedValue(null);

    const result = await applyCondition(BASE_PARAMS, fakeSettings);
    expect(result).toMatch(/Could not apply condition.*after 5 attempts/);
  });
});
