import { vi, describe, it, expect, beforeEach } from 'vitest';
import { SupabaseStore } from '../../src/lib/supabase_store.js';
import removeItem from '../../src/functions/remove_item.js';
import { makeMockStore } from '../helpers/mock_store.js';
import { makeCharacter, fakeSettings } from '../helpers/fixtures.js';

vi.mock('../../src/lib/supabase_store.js', () => ({ SupabaseStore: vi.fn() }));
vi.mock('../../src/lib/migrations.js', () => ({ ensureMigrations: vi.fn().mockResolvedValue(undefined) }));

const GAME = 'test-game';
const BASE_PARAMS = { game: GAME, entity_type: 'character', entity: 'aragorn', item: 'Arrow' };

describe('remove_item', () => {
  let store;

  beforeEach(() => {
    store = makeMockStore();
    vi.mocked(SupabaseStore).mockImplementation(function () { return store; });
  });

  it('returns error when entity not found', async () => {
    store.get.mockResolvedValue(null);
    expect(await removeItem(BASE_PARAMS, fakeSettings)).toContain('No character found');
  });

  it('returns error when item not in equipment', async () => {
    store.get.mockResolvedValue(makeCharacter({ equipment: ['Sword'] }));
    expect(await removeItem(BASE_PARAMS, fakeSettings)).toContain('"Arrow" is not in');
  });

  it('removes a plain item entirely', async () => {
    store.get.mockResolvedValue(makeCharacter({ equipment: ['Arrow', 'Sword'] }));
    await removeItem(BASE_PARAMS, fakeSettings);
    expect(store.patch).toHaveBeenCalledWith(
      'characters', expect.any(String), { equipment: ['Sword'] }, expect.any(String),
    );
  });

  it('decrements a grouped entry by 1', async () => {
    store.get.mockResolvedValue(makeCharacter({ equipment: ['Arrow (x10)'] }));
    await removeItem(BASE_PARAMS, fakeSettings);
    expect(store.patch).toHaveBeenCalledWith(
      'characters', expect.any(String), { equipment: ['Arrow (x9)'] }, expect.any(String),
    );
  });

  it('collapses to plain string when count reaches 1', async () => {
    store.get.mockResolvedValue(makeCharacter({ equipment: ['Arrow (x2)'] }));
    await removeItem(BASE_PARAMS, fakeSettings);
    expect(store.patch).toHaveBeenCalledWith(
      'characters', expect.any(String), { equipment: ['Arrow'] }, expect.any(String),
    );
  });

  it('removes grouped entry entirely when quantity matches', async () => {
    store.get.mockResolvedValue(makeCharacter({ equipment: ['Arrow (x5)'] }));
    await removeItem({ ...BASE_PARAMS, quantity: 5 }, fakeSettings);
    expect(store.patch).toHaveBeenCalledWith(
      'characters', expect.any(String), { equipment: [] }, expect.any(String),
    );
  });

  it('removes grouped entry entirely when quantity exceeds stack', async () => {
    store.get.mockResolvedValue(makeCharacter({ equipment: ['Arrow (x3)'] }));
    await removeItem({ ...BASE_PARAMS, quantity: 10 }, fakeSettings);
    expect(store.patch).toHaveBeenCalledWith(
      'characters', expect.any(String), { equipment: [] }, expect.any(String),
    );
  });

  it('matches grouped entry when removing with quantity=1', async () => {
    // The trident-thrown-at-enemy case: give "trident (x2)", remove "trident"
    store.get.mockResolvedValue(makeCharacter({ equipment: ['Trident (x2)'] }));
    await removeItem({ ...BASE_PARAMS, item: 'Trident' }, fakeSettings);
    expect(store.patch).toHaveBeenCalledWith(
      'characters', expect.any(String), { equipment: ['Trident'] }, expect.any(String),
    );
  });

  it('handles item names with regex special characters', async () => {
    store.get.mockResolvedValue(makeCharacter({ equipment: ['Sword +1 (x3)'] }));
    await removeItem({ ...BASE_PARAMS, item: 'Sword +1' }, fakeSettings);
    expect(store.patch).toHaveBeenCalledWith(
      'characters', expect.any(String), { equipment: ['Sword +1 (x2)'] }, expect.any(String),
    );
  });
});
