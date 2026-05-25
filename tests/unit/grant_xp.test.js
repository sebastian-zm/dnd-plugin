import { vi, describe, it, expect, beforeEach } from 'vitest';
import { SupabaseStore } from '../../src/lib/supabase_store.js';
import grantXp from '../../src/functions/grant_xp.js';
import { makeMockStore } from '../helpers/mock_store.js';
import { makeGame, makeCharacter, fakeSettings } from '../helpers/fixtures.js';

vi.mock('../../src/lib/supabase_store.js', () => ({ SupabaseStore: vi.fn() }));
vi.mock('../../src/lib/migrations.js', () => ({ ensureMigrations: vi.fn().mockResolvedValue(undefined) }));

const GAME = 'test-game';

describe('grant_xp', () => {
  let store;

  beforeEach(() => {
    store = makeMockStore();
    vi.mocked(SupabaseStore).mockImplementation(function() { return store; });
  });

  it('returns error when game not found', async () => {
    store.get.mockResolvedValue(null);
    const result = await grantXp({ game: GAME, amount: 100 }, fakeSettings);
    expect(result).toBe('No game found with slug "test-game".');
  });

  it('returns error when no characters exist in game', async () => {
    store.get.mockResolvedValue(makeGame());
    store.list.mockResolvedValue([]);
    const result = await grantXp({ game: GAME, amount: 100 }, fakeSettings);
    expect(result).toBe('No characters found in game "test-game".');
  });

  it('grants XP to all characters when no targets specified', async () => {
    const aragorn = makeCharacter({ xp: 0, name: 'Aragorn' });
    const legolas = makeCharacter({ id: 'bbbbbbbb-0000-0000-0000-000000000002', name: 'Legolas', xp: 100 });
    store.get.mockResolvedValue(makeGame());
    store.list.mockResolvedValue([aragorn, legolas]);

    const result = await grantXp({ game: GAME, amount: 50 }, fakeSettings);

    expect(store.patch).toHaveBeenCalledWith('characters', aragorn.id, { xp: 50 }, aragorn.updated_at);
    expect(store.patch).toHaveBeenCalledWith('characters', legolas.id, { xp: 150 }, legolas.updated_at);
    expect(result).toContain('Granted 50 XP.');
    expect(result).toContain('Aragorn: 0 → 50 XP');
    expect(result).toContain('Legolas: 100 → 150 XP');
  });

  it('grants XP to specific characters only', async () => {
    const aragorn = makeCharacter({ xp: 300 });
    store.get.mockImplementation((table, id) => {
      if (table === 'games') return Promise.resolve(makeGame());
      return Promise.resolve(aragorn);
    });

    const result = await grantXp({ game: GAME, amount: 200, characters: ['aragorn'] }, fakeSettings);

    expect(store.patch).toHaveBeenCalledWith('characters', aragorn.id, { xp: 500 }, aragorn.updated_at);
    expect(result).toContain('Aragorn: 300 → 500 XP');
  });

  it('reports missing characters in targeted grant', async () => {
    store.get.mockImplementation((table) => {
      if (table === 'games') return Promise.resolve(makeGame());
      return Promise.resolve(null);
    });

    const result = await grantXp(
      { game: GAME, amount: 100, characters: ['nobody'] },
      fakeSettings,
    );
    expect(result).toBe('Characters not found in game "test-game": nobody.');
  });

  it('treats missing xp field as 0', async () => {
    const char = makeCharacter({ xp: undefined });
    store.get.mockResolvedValue(makeGame());
    store.list.mockResolvedValue([char]);

    const result = await grantXp({ game: GAME, amount: 100 }, fakeSettings);
    expect(result).toContain('Aragorn: 0 → 100 XP');
  });
});
