const MIGRATIONS = [
  {
    version: '20260523110846',
    name: 'create_npcs_table',
    sql: `
      CREATE TABLE IF NOT EXISTS npcs (
        id                    UUID PRIMARY KEY,
        name                  TEXT,
        species               TEXT,
        size                  TEXT,
        creature_type         TEXT,
        alignment             TEXT,
        ac                    INTEGER,
        max_hp                INTEGER,
        current_hp            INTEGER,
        temporary_hp          INTEGER DEFAULT 0,
        speeds                TEXT,
        strength              INTEGER,
        dexterity             INTEGER,
        constitution          INTEGER,
        intelligence          INTEGER,
        wisdom                INTEGER,
        charisma              INTEGER,
        pb                    INTEGER,
        proficiencies         JSONB DEFAULT '[]',
        expertise             JSONB DEFAULT '[]',
        weapon_mastery        JSONB DEFAULT '[]',
        spellcasting_ability  TEXT,
        spells_known          JSONB DEFAULT '[]',
        spells_prepared       JSONB DEFAULT '[]',
        spell_slots_total     JSONB DEFAULT '{}',
        spell_slots_usable    JSONB DEFAULT '{}',
        senses                TEXT,
        languages             JSONB DEFAULT '[]',
        cr                    TEXT,
        damage_resistances    JSONB DEFAULT '[]',
        damage_immunities     JSONB DEFAULT '[]',
        damage_vulnerabilities JSONB DEFAULT '[]',
        condition_immunities  JSONB DEFAULT '[]',
        traits                JSONB DEFAULT '[]',
        actions               JSONB DEFAULT '[]',
        bonus_actions         JSONB DEFAULT '[]',
        reactions             JSONB DEFAULT '[]',
        legendary_resistances INTEGER DEFAULT 0,
        legendary_actions     JSONB DEFAULT '[]',
        lair_actions          JSONB DEFAULT '[]',
        equipment             JSONB DEFAULT '[]',
        notes                 TEXT,
        created_at            TIMESTAMPTZ DEFAULT NOW(),
        updated_at            TIMESTAMPTZ DEFAULT NOW()
      );
    `,
  },
  {
    version: '20260523120000',
    name: 'create_games_table',
    sql: `
      CREATE TABLE IF NOT EXISTS games (
        id          UUID PRIMARY KEY,
        slug        TEXT UNIQUE NOT NULL,
        name        TEXT NOT NULL,
        description TEXT,
        created_at  TIMESTAMPTZ DEFAULT NOW(),
        updated_at  TIMESTAMPTZ DEFAULT NOW()
      );
    `,
  },
  {
    version: '20260523120001',
    name: 'add_slug_and_game_to_npcs',
    sql: `
      ALTER TABLE npcs ADD COLUMN IF NOT EXISTS game_slug TEXT NOT NULL DEFAULT '';
      ALTER TABLE npcs ADD COLUMN IF NOT EXISTS slug TEXT NOT NULL DEFAULT '';
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM pg_constraint WHERE conname = 'npcs_game_slug_slug_unique'
        ) THEN
          ALTER TABLE npcs ADD CONSTRAINT npcs_game_slug_slug_unique UNIQUE (game_slug, slug);
        END IF;
      END $$;
    `,
  },
  {
    version: '20260523120002',
    name: 'create_characters_table',
    sql: `
      CREATE TABLE IF NOT EXISTS characters (
        id                    UUID PRIMARY KEY,
        game_slug             TEXT NOT NULL,
        slug                  TEXT NOT NULL,
        name                  TEXT NOT NULL,
        player                TEXT,
        species               TEXT,
        class_name            TEXT,
        subclass              TEXT,
        level                 INTEGER DEFAULT 1,
        background            TEXT,
        ac                    INTEGER,
        max_hp                INTEGER,
        current_hp            INTEGER,
        temporary_hp          INTEGER DEFAULT 0,
        speeds                TEXT,
        strength              INTEGER,
        dexterity             INTEGER,
        constitution          INTEGER,
        intelligence          INTEGER,
        wisdom                INTEGER,
        charisma              INTEGER,
        pb                    INTEGER,
        proficiencies         JSONB DEFAULT '[]',
        expertise             JSONB DEFAULT '[]',
        weapon_mastery        JSONB DEFAULT '[]',
        spellcasting_ability  TEXT,
        spells_known          JSONB DEFAULT '[]',
        spells_prepared       JSONB DEFAULT '[]',
        spell_slots_total     JSONB DEFAULT '{}',
        spell_slots_usable    JSONB DEFAULT '{}',
        senses                TEXT,
        languages             JSONB DEFAULT '[]',
        damage_resistances    JSONB DEFAULT '[]',
        damage_immunities     JSONB DEFAULT '[]',
        condition_immunities  JSONB DEFAULT '[]',
        features              JSONB DEFAULT '[]',
        equipment             JSONB DEFAULT '[]',
        notes                 TEXT,
        created_at            TIMESTAMPTZ DEFAULT NOW(),
        updated_at            TIMESTAMPTZ DEFAULT NOW(),
        CONSTRAINT characters_game_slug_slug_unique UNIQUE (game_slug, slug)
      );
    `,
  },
  {
    version: '20260523130000',
    name: 'backfill_empty_npc_slugs',
    sql: `
      UPDATE npcs SET slug = id::text WHERE slug = '';
      UPDATE npcs SET game_slug = id::text WHERE game_slug = '';
    `,
  },
  {
    version: '20260523140000',
    name: 'create_game_memories_table',
    sql: `
      CREATE TABLE IF NOT EXISTS game_memories (
        id         UUID PRIMARY KEY,
        game_slug  TEXT NOT NULL,
        slug       TEXT NOT NULL,
        name       TEXT NOT NULL,
        memory     TEXT NOT NULL,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW(),
        CONSTRAINT game_memories_game_slug_slug_unique UNIQUE (game_slug, slug)
      );
    `,
  },
  {
    version: '20260523150000',
    name: 'add_gold_to_characters_and_npcs',
    sql: `
      ALTER TABLE characters ADD COLUMN IF NOT EXISTS gold NUMERIC(12,4) NOT NULL DEFAULT 0;
      ALTER TABLE npcs       ADD COLUMN IF NOT EXISTS gold NUMERIC(12,4) NOT NULL DEFAULT 0;
    `,
  },
  {
    version: '20260524120000',
    name: 'add_damage_vulnerabilities_to_characters',
    sql: `
      ALTER TABLE characters ADD COLUMN IF NOT EXISTS damage_vulnerabilities JSONB DEFAULT '[]';
    `,
  },
  {
    version: '20260524123711',
    name: 'add_conditions_to_characters_and_npcs',
    sql: `
      ALTER TABLE characters ADD COLUMN IF NOT EXISTS conditions JSONB DEFAULT '[]';
      ALTER TABLE npcs       ADD COLUMN IF NOT EXISTS conditions JSONB DEFAULT '[]';
    `,
  },
  {
    version: '20260525085742',
    name: 'add_xp_to_characters',
    sql: `
      ALTER TABLE characters ADD COLUMN IF NOT EXISTS xp INTEGER NOT NULL DEFAULT 0;
    `,
  },
  {
    version: '20260525141824',
    name: 'add_resources_and_death_saves_to_characters',
    sql: `
      ALTER TABLE characters ADD COLUMN IF NOT EXISTS resources            JSONB   DEFAULT '[]';
      ALTER TABLE characters ADD COLUMN IF NOT EXISTS death_save_successes INTEGER NOT NULL DEFAULT 0;
      ALTER TABLE characters ADD COLUMN IF NOT EXISTS death_save_failures  INTEGER NOT NULL DEFAULT 0;
    `,
  },
  {
    version: '20260525141825',
    name: 'add_resources_to_npcs',
    sql: `
      ALTER TABLE npcs ADD COLUMN IF NOT EXISTS resources JSONB DEFAULT '[]';
    `,
  },
  {
    version: '20260525141826',
    name: 'add_combat_state_to_games',
    sql: `
      ALTER TABLE games ADD COLUMN IF NOT EXISTS combat_active          BOOLEAN NOT NULL DEFAULT FALSE;
      ALTER TABLE games ADD COLUMN IF NOT EXISTS combat_round           INTEGER NOT NULL DEFAULT 0;
      ALTER TABLE games ADD COLUMN IF NOT EXISTS turn_order             JSONB   NOT NULL DEFAULT '[]';
      ALTER TABLE games ADD COLUMN IF NOT EXISTS active_combatant_index INTEGER NOT NULL DEFAULT 0;
    `,
  },
  {
    version: '20260528155905',
    name: 'add_concentration_to_characters_and_npcs',
    sql: `
      ALTER TABLE characters ADD COLUMN IF NOT EXISTS concentration JSONB DEFAULT NULL;
      ALTER TABLE npcs       ADD COLUMN IF NOT EXISTS concentration JSONB DEFAULT NULL;
    `,
  },
  {
    version: '20260528193733',
    name: 'add_tags_to_game_memories',
    sql: `
      ALTER TABLE game_memories ADD COLUMN IF NOT EXISTS tags JSONB DEFAULT '[]';
    `,
  },
  {
    version: '20260528193734',
    name: 'add_world_time_to_games',
    sql: `
      ALTER TABLE games ADD COLUMN IF NOT EXISTS world_time JSONB DEFAULT NULL;
    `,
  },
  {
    version: '20260528193735',
    name: 'create_session_logs_table',
    sql: `
      CREATE TABLE IF NOT EXISTS session_logs (
        id         UUID PRIMARY KEY,
        game_slug  TEXT NOT NULL,
        category   TEXT,
        entry      TEXT NOT NULL,
        world_time JSONB DEFAULT NULL,
        created_at TIMESTAMPTZ DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS session_logs_game_slug_idx ON session_logs (game_slug);
    `,
  },
];

// Module-level guard: in a persistent process (MCP server) migrations only run once.
// In a stateless TypingMind invocation this is always false at call start, so the
// check runs every call (2 RPC round-trips in the steady state — cheap).
let _confirmed = false;

export async function ensureMigrations(userSettings) {
  if (_confirmed) return;

  const { externalDbUrl, externalDbKey } = userSettings;
  const rpcUrl = `${externalDbUrl}/rest/v1/rpc/execute_migration_sql`;
  const headers = {
    'apikey': externalDbKey,
    'Authorization': `Bearer ${externalDbKey}`,
    'Content-Type': 'application/json',
  };

  const execute = async (sql) => {
    const res = await fetch(rpcUrl, {
      method: 'POST',
      headers,
      body: JSON.stringify({ sql, is_query: false }),
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({ message: res.statusText }));
      throw new Error(`SQL failed: ${body.message ?? body.hint ?? JSON.stringify(body)}`);
    }
  };

  const query = async (sql) => {
    const res = await fetch(rpcUrl, {
      method: 'POST',
      headers,
      body: JSON.stringify({ sql, is_query: true }),
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({ message: res.statusText }));
      throw new Error(`Query failed: ${body.message ?? body.hint ?? JSON.stringify(body)}`);
    }
    return res.json();
  };

  await execute(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version    TEXT PRIMARY KEY,
      name       TEXT NOT NULL,
      applied_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);

  const applied = await query('SELECT version FROM schema_migrations ORDER BY version');
  const appliedVersions = new Set(applied.map(r => r.version));

  let appliedCount = 0;
  for (const migration of MIGRATIONS) {
    if (appliedVersions.has(migration.version)) continue;
    await execute(migration.sql);
    await execute(
      `INSERT INTO schema_migrations (version, name) VALUES ('${migration.version}', '${migration.name}') ON CONFLICT (version) DO NOTHING`
    );
    appliedCount++;
  }

  // Reload PostgREST's schema cache after DDL changes so new columns are immediately visible.
  if (appliedCount > 0) {
    await execute(`NOTIFY pgrst, 'reload schema'`);
    // Give PostgREST a moment to process the reload before the first query.
    await new Promise(r => setTimeout(r, 500));
  }

  _confirmed = true;
}
