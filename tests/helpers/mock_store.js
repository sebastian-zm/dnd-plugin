import { vi } from 'vitest';

export function makeMockStore(overrides = {}) {
  return {
    get: vi.fn().mockResolvedValue(null),
    list: vi.fn().mockResolvedValue([]),
    insert: vi.fn().mockResolvedValue({}),
    upsert: vi.fn().mockResolvedValue({}),
    patch: vi.fn().mockResolvedValue({ id: 'patched' }),
    delete: vi.fn().mockResolvedValue(undefined),
    deleteWhere: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}
