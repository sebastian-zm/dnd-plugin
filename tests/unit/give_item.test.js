import { vi, describe, it, expect, beforeEach } from 'vitest';
import { SupabaseStore } from '../../src/lib/supabase_store.js';
import giveItem from '../../src/functions/give_item.js';
import { makeMockStore } from '../helpers/mock_store.js';
import { makeCharacter, fakeSettings } from '../helpers/fixtures.js';

vi.mock('../../src/lib/supabase_store.js', () => ({ SupabaseStore: vi.fn() }));
vi.mock('../../src/lib/migrations.js', () => ({ ensureMigrations: vi.fn().mockResolvedValue(undefined) }));

const GAME = 'test-game';
const BASE_PARAMS = { game: GAME, entity_type: 'character', entity: 'aragorn', item: 'Arrow' };

describe('give_item', () => {
  let store;

  beforeEach(() => {
    store = makeMockStore();
    vi.mocked(SupabaseStore).mockImplementation(function () { return store; });
  });

  it('returns error when entity not found', async () => {
    store.get.mockResolvedValue(null);
    const result = await giveItem(BASE_PARAMS, fakeSettings);
    expect(result).toContain('No character found');
  });

  it('adds a plain item when equipment is empty', async () => {
    store.get.mockResolvedValue(makeCharacter({ equipment: [] }));
    const result = await giveItem(BASE_PARAMS, fakeSettings);
    expect(store.patch).toHaveBeenCalledWith(
      'characters', expect.any(String), { equipment: ['Arrow'] }, expect.any(String),
    );
    expect(result).toContain('"Arrow" added');
  });

  it('adds quantity=1 as a plain string', async () => {
    store.get.mockResolvedValue(makeCharacter({ equipment: [] }));
    await giveItem({ ...BASE_PARAMS, quantity: 1 }, fakeSettings);
    expect(store.patch).toHaveBeenCalledWith(
      'characters', expect.any(String), { equipment: ['Arrow'] }, expect.any(String),
    );
  });

  it('adds quantity>1 as grouped entry', async () => {
    store.get.mockResolvedValue(makeCharacter({ equipment: [] }));
    await giveItem({ ...BASE_PARAMS, quantity: 20 }, fakeSettings);
    expect(store.patch).toHaveBeenCalledWith(
      'characters', expect.any(String), { equipment: ['Arrow (x20)'] }, expect.any(String),
    );
  });

  it('increments a plain existing entry', async () => {
    store.get.mockResolvedValue(makeCharacter({ equipment: ['Arrow'] }));
    await giveItem({ ...BASE_PARAMS, quantity: 9 }, fakeSettings);
    expect(store.patch).toHaveBeenCalledWith(
      'characters', expect.any(String), { equipment: ['Arrow (x10)'] }, expect.any(String),
    );
  });

  it('increments a grouped existing entry', async () => {
    store.get.mockResolvedValue(makeCharacter({ equipment: ['Arrow (x30)'] }));
    await giveItem({ ...BASE_PARAMS, quantity: 20 }, fakeSettings);
    expect(store.patch).toHaveBeenCalledWith(
      'characters', expect.any(String), { equipment: ['Arrow (x50)'] }, expect.any(String),
    );
  });

  it('does not merge items with different names', async () => {
    store.get.mockResolvedValue(makeCharacter({ equipment: ['Bolt (x10)'] }));
    await giveItem({ ...BASE_PARAMS, item: 'Arrow', quantity: 5 }, fakeSettings);
    expect(store.patch).toHaveBeenCalledWith(
      'characters', expect.any(String), { equipment: ['Bolt (x10)', 'Arrow (x5)'] }, expect.any(String),
    );
  });

  it('handles item names with regex special characters', async () => {
    store.get.mockResolvedValue(makeCharacter({ equipment: ['Sword +1'] }));
    await giveItem({ ...BASE_PARAMS, item: 'Sword +1' }, fakeSettings);
    expect(store.patch).toHaveBeenCalledWith(
      'characters', expect.any(String), { equipment: ['Sword +1 (x2)'] }, expect.any(String),
    );
  });
});
