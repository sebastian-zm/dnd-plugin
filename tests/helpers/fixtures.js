export const fakeSettings = {
  externalDbUrl: 'http://fake.supabase.co',
  externalDbKey: 'fake-key',
};

export const makeGame = (overrides = {}) => ({
  id: 'aaaaaaaa-0000-0000-0000-000000000001',
  slug: 'test-game',
  name: 'Test Game',
  description: 'A game for testing',
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-01T00:00:00Z',
  ...overrides,
});

export const makeCharacter = (overrides = {}) => ({
  id: 'bbbbbbbb-0000-0000-0000-000000000001',
  game_slug: 'test-game',
  slug: 'aragorn',
  name: 'Aragorn',
  class_name: 'Ranger',
  level: 5,
  max_hp: 50,
  current_hp: 50,
  temporary_hp: 0,
  conditions: [],
  condition_immunities: [],
  damage_immunities: [],
  damage_resistances: [],
  damage_vulnerabilities: [],
  spell_slots_total: {},
  spell_slots_usable: {},
  proficiencies: [],
  expertise: [],
  xp: 6500,
  updated_at: '2026-01-01T00:00:00Z',
  ...overrides,
});

export const makeNpc = (overrides = {}) => ({
  id: 'cccccccc-0000-0000-0000-000000000001',
  game_slug: 'test-game',
  slug: 'goblin',
  name: 'Goblin',
  max_hp: 7,
  current_hp: 7,
  temporary_hp: 0,
  conditions: [],
  condition_immunities: [],
  damage_immunities: [],
  damage_resistances: [],
  damage_vulnerabilities: [],
  updated_at: '2026-01-01T00:00:00Z',
  ...overrides,
});
