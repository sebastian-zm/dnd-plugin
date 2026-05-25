import { vi, describe, it, expect, beforeEach } from 'vitest';
import { SupabaseStore } from '../../src/lib/supabase_store.js';
import upsertCharacter from '../../src/functions/upsert_character.js';
import { makeMockStore } from '../helpers/mock_store.js';
import { makeGame, makeCharacter, fakeSettings } from '../helpers/fixtures.js';

vi.mock('../../src/lib/supabase_store.js', () => ({ SupabaseStore: vi.fn() }));
vi.mock('../../src/lib/migrations.js', () => ({ ensureMigrations: vi.fn().mockResolvedValue(undefined) }));

const GAME = 'test-game';

describe('upsert_character', () => {
  let store;

  beforeEach(() => {
    store = makeMockStore();
    vi.mocked(SupabaseStore).mockImplementation(function() { return store; });
  });

  it('returns error when game not found', async () => {
    store.get.mockResolvedValue(null);
    const result = await upsertCharacter({ game: GAME, name: 'Aragorn' }, fakeSettings);
    expect(result).toContain('No game found with slug "test-game"');
  });

  it('creates a new character with auto-generated slug', async () => {
    store.get.mockImplementation((table) =>
      table === 'games' ? Promise.resolve(makeGame()) : Promise.resolve(null),
    );

    const result = await upsertCharacter(
      { game: GAME, name: 'Legolas Greenleaf', max_hp: 40 },
      fakeSettings,
    );

    const inserted = store.insert.mock.calls[0][1];
    expect(inserted.slug).toBe('legolas-greenleaf');
    expect(inserted.game_slug).toBe(GAME);
    expect(inserted.max_hp).toBe(40);
    expect(inserted.current_hp).toBe(40); // defaults to max_hp
    expect(inserted.level).toBe(1);       // default level
    expect(result).toBe('Character "Legolas Greenleaf" created with slug "legolas-greenleaf" in game "test-game".');
  });

  it('respects an explicit slug', async () => {
    store.get.mockImplementation((table) =>
      table === 'games' ? Promise.resolve(makeGame()) : Promise.resolve(null),
    );

    await upsertCharacter({ game: GAME, name: 'Aragorn', slug: 'strider' }, fakeSettings);
    const inserted = store.insert.mock.calls[0][1];
    expect(inserted.slug).toBe('strider');
  });

  it('updates an existing character', async () => {
    const existing = makeCharacter({ max_hp: 50, current_hp: 30 });
    store.get.mockImplementation((table) =>
      table === 'games' ? Promise.resolve(makeGame()) : Promise.resolve(existing),
    );

    const result = await upsertCharacter(
      { game: GAME, name: 'Aragorn', max_hp: 60 },
      fakeSettings,
    );

    expect(store.patch).toHaveBeenCalledWith(
      'characters', existing.id, expect.objectContaining({ max_hp: 60 }),
    );
    expect(result).toBe('Character "Aragorn" (slug: "aragorn") updated in game "test-game".');
  });

  it('does not include immutable fields in patch', async () => {
    const existing = makeCharacter();
    store.get.mockImplementation((table) =>
      table === 'games' ? Promise.resolve(makeGame()) : Promise.resolve(existing),
    );

    await upsertCharacter({ game: GAME, name: 'Aragorn', max_hp: 60 }, fakeSettings);
    const patchArgs = store.patch.mock.calls[0][2];
    expect(patchArgs).not.toHaveProperty('id');
    expect(patchArgs).not.toHaveProperty('game_slug');
    expect(patchArgs).not.toHaveProperty('slug');
  });

  it('sets temporary_hp and other arrays to sensible defaults for new character', async () => {
    store.get.mockImplementation((table) =>
      table === 'games' ? Promise.resolve(makeGame()) : Promise.resolve(null),
    );

    await upsertCharacter({ game: GAME, name: 'Gimli', max_hp: 55 }, fakeSettings);
    const inserted = store.insert.mock.calls[0][1];
    expect(inserted.temporary_hp).toBe(0);
    expect(inserted.proficiencies).toEqual([]);
    expect(inserted.conditions).toEqual([]);
    expect(inserted.gold).toBe(0);
    expect(inserted.xp).toBe(0);
  });
});
