import { vi, describe, it, expect, beforeEach } from 'vitest';
import { SupabaseStore } from '../../src/lib/supabase_store.js';
import createGame from '../../src/functions/create_game.js';
import { makeMockStore } from '../helpers/mock_store.js';
import { fakeSettings } from '../helpers/fixtures.js';

vi.mock('../../src/lib/supabase_store.js', () => ({ SupabaseStore: vi.fn() }));
vi.mock('../../src/lib/migrations.js', () => ({ ensureMigrations: vi.fn().mockResolvedValue(undefined) }));

describe('create_game', () => {
  let store;

  beforeEach(() => {
    store = makeMockStore();
    vi.mocked(SupabaseStore).mockImplementation(function() { return store; });
  });

  it('creates a game and returns confirmation', async () => {
    const result = await createGame(
      { slug: 'my-campaign', name: 'My Campaign', description: 'An adventure' },
      fakeSettings,
    );

    expect(store.insert).toHaveBeenCalledWith(
      'games',
      expect.objectContaining({ slug: 'my-campaign', name: 'My Campaign', description: 'An adventure' }),
    );
    expect(result).toBe('Game "My Campaign" created with slug "my-campaign".');
  });

  it('inserts a UUID', async () => {
    await createGame({ slug: 'x', name: 'X' }, fakeSettings);
    const record = store.insert.mock.calls[0][1];
    expect(record.id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-/i);
  });

  it('returns friendly message on duplicate slug', async () => {
    const err = new Error('unique constraint');
    err.code = '23505';
    store.insert.mockRejectedValue(err);

    const result = await createGame({ slug: 'taken', name: 'Taken' }, fakeSettings);
    expect(result).toBe('A game with slug "taken" already exists.');
  });

  it('rethrows unexpected errors', async () => {
    const err = new Error('network failure');
    err.code = '500';
    store.insert.mockRejectedValue(err);

    await expect(createGame({ slug: 'x', name: 'X' }, fakeSettings)).rejects.toThrow('network failure');
  });
});
