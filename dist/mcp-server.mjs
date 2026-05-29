#!/usr/bin/env node

// src/lib/supabase_store.js
var SupabaseStore = class {
  constructor(url, key) {
    this.url = url;
    this.key = key;
  }
  get #headers() {
    return {
      "apikey": this.key,
      "Authorization": `Bearer ${this.key}`,
      "Content-Type": "application/json"
    };
  }
  #throwError(context, body) {
    const detail = body.detail ? ` Detail: ${body.detail}` : "";
    const err = new Error(`${context}: ${body.message ?? JSON.stringify(body)}${detail}`);
    err.code = body.code;
    throw err;
  }
  async #checkResponse(res, context) {
    if (!res.ok) {
      const body = await res.json().catch(() => ({ message: res.statusText }));
      this.#throwError(context, body);
    }
  }
  async insert(table, record) {
    const res = await fetch(`${this.url}/rest/v1/${table}`, {
      method: "POST",
      headers: { ...this.#headers, "Prefer": "return=representation" },
      body: JSON.stringify(record)
    });
    await this.#checkResponse(res, `insert ${table}`);
    const data = await res.json();
    return data[0];
  }
  async upsert(table, record) {
    const res = await fetch(`${this.url}/rest/v1/${table}`, {
      method: "POST",
      headers: { ...this.#headers, "Prefer": "resolution=merge-duplicates,return=representation" },
      body: JSON.stringify(record)
    });
    await this.#checkResponse(res, `upsert ${table}`);
    const data = await res.json();
    return data[0];
  }
  async get(table, idOrSlug, gameSlug) {
    const isUuid = /^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i.test(idOrSlug);
    let url = `${this.url}/rest/v1/${table}?`;
    if (isUuid) {
      url += `id=eq.${idOrSlug}`;
    } else {
      url += `slug=eq.${encodeURIComponent(idOrSlug)}`;
      if (gameSlug) url += `&game_slug=eq.${encodeURIComponent(gameSlug)}`;
    }
    url += "&limit=1";
    const res = await fetch(url, { headers: this.#headers });
    await this.#checkResponse(res, `get ${table}`);
    const data = await res.json();
    return data[0] ?? null;
  }
  async list(table, filters = {}, options = {}) {
    const params = Object.entries(filters).map(([k, v]) => `${k}=eq.${encodeURIComponent(v)}`);
    if (options.order) params.push(`order=${encodeURIComponent(options.order)}`);
    if (options.limit) params.push(`limit=${options.limit}`);
    const query = params.join("&");
    const res = await fetch(`${this.url}/rest/v1/${table}${query ? `?${query}` : ""}`, {
      headers: this.#headers
    });
    await this.#checkResponse(res, `list ${table}`);
    return res.json();
  }
  async patch(table, id, changes, updatedAt) {
    const body = { ...changes, updated_at: (/* @__PURE__ */ new Date()).toISOString() };
    let url = `${this.url}/rest/v1/${table}?id=eq.${encodeURIComponent(id)}`;
    if (updatedAt !== void 0) {
      url += `&updated_at=eq.${encodeURIComponent(updatedAt)}`;
    }
    const res = await fetch(url, {
      method: "PATCH",
      headers: { ...this.#headers, "Prefer": "return=representation" },
      body: JSON.stringify(body)
    });
    await this.#checkResponse(res, `patch ${table}`);
    const data = await res.json();
    return updatedAt !== void 0 ? data[0] ?? null : data[0];
  }
  async delete(table, id) {
    const res = await fetch(`${this.url}/rest/v1/${table}?id=eq.${encodeURIComponent(id)}`, {
      method: "DELETE",
      headers: this.#headers
    });
    await this.#checkResponse(res, `delete ${table}`);
  }
  async deleteWhere(table, filters = {}) {
    const query = Object.entries(filters).map(([k, v]) => `${k}=eq.${encodeURIComponent(v)}`).join("&");
    if (!query) throw new Error("deleteWhere requires at least one filter");
    const res = await fetch(`${this.url}/rest/v1/${table}?${query}`, {
      method: "DELETE",
      headers: this.#headers
    });
    await this.#checkResponse(res, `deleteWhere ${table}`);
  }
};

// src/lib/migrations.js
var MIGRATIONS = [
  {
    version: "20260523110846",
    name: "create_npcs_table",
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
    `
  },
  {
    version: "20260523120000",
    name: "create_games_table",
    sql: `
      CREATE TABLE IF NOT EXISTS games (
        id          UUID PRIMARY KEY,
        slug        TEXT UNIQUE NOT NULL,
        name        TEXT NOT NULL,
        description TEXT,
        created_at  TIMESTAMPTZ DEFAULT NOW(),
        updated_at  TIMESTAMPTZ DEFAULT NOW()
      );
    `
  },
  {
    version: "20260523120001",
    name: "add_slug_and_game_to_npcs",
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
    `
  },
  {
    version: "20260523120002",
    name: "create_characters_table",
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
    `
  },
  {
    version: "20260523130000",
    name: "backfill_empty_npc_slugs",
    sql: `
      UPDATE npcs SET slug = id::text WHERE slug = '';
      UPDATE npcs SET game_slug = id::text WHERE game_slug = '';
    `
  },
  {
    version: "20260523140000",
    name: "create_game_memories_table",
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
    `
  },
  {
    version: "20260523150000",
    name: "add_gold_to_characters_and_npcs",
    sql: `
      ALTER TABLE characters ADD COLUMN IF NOT EXISTS gold NUMERIC(12,4) NOT NULL DEFAULT 0;
      ALTER TABLE npcs       ADD COLUMN IF NOT EXISTS gold NUMERIC(12,4) NOT NULL DEFAULT 0;
    `
  },
  {
    version: "20260524120000",
    name: "add_damage_vulnerabilities_to_characters",
    sql: `
      ALTER TABLE characters ADD COLUMN IF NOT EXISTS damage_vulnerabilities JSONB DEFAULT '[]';
    `
  },
  {
    version: "20260524123711",
    name: "add_conditions_to_characters_and_npcs",
    sql: `
      ALTER TABLE characters ADD COLUMN IF NOT EXISTS conditions JSONB DEFAULT '[]';
      ALTER TABLE npcs       ADD COLUMN IF NOT EXISTS conditions JSONB DEFAULT '[]';
    `
  },
  {
    version: "20260525085742",
    name: "add_xp_to_characters",
    sql: `
      ALTER TABLE characters ADD COLUMN IF NOT EXISTS xp INTEGER NOT NULL DEFAULT 0;
    `
  },
  {
    version: "20260525141824",
    name: "add_resources_and_death_saves_to_characters",
    sql: `
      ALTER TABLE characters ADD COLUMN IF NOT EXISTS resources            JSONB   DEFAULT '[]';
      ALTER TABLE characters ADD COLUMN IF NOT EXISTS death_save_successes INTEGER NOT NULL DEFAULT 0;
      ALTER TABLE characters ADD COLUMN IF NOT EXISTS death_save_failures  INTEGER NOT NULL DEFAULT 0;
    `
  },
  {
    version: "20260525141825",
    name: "add_resources_to_npcs",
    sql: `
      ALTER TABLE npcs ADD COLUMN IF NOT EXISTS resources JSONB DEFAULT '[]';
    `
  },
  {
    version: "20260525141826",
    name: "add_combat_state_to_games",
    sql: `
      ALTER TABLE games ADD COLUMN IF NOT EXISTS combat_active          BOOLEAN NOT NULL DEFAULT FALSE;
      ALTER TABLE games ADD COLUMN IF NOT EXISTS combat_round           INTEGER NOT NULL DEFAULT 0;
      ALTER TABLE games ADD COLUMN IF NOT EXISTS turn_order             JSONB   NOT NULL DEFAULT '[]';
      ALTER TABLE games ADD COLUMN IF NOT EXISTS active_combatant_index INTEGER NOT NULL DEFAULT 0;
    `
  },
  {
    version: "20260528155905",
    name: "add_concentration_to_characters_and_npcs",
    sql: `
      ALTER TABLE characters ADD COLUMN IF NOT EXISTS concentration JSONB DEFAULT NULL;
      ALTER TABLE npcs       ADD COLUMN IF NOT EXISTS concentration JSONB DEFAULT NULL;
    `
  },
  {
    version: "20260528193733",
    name: "add_tags_to_game_memories",
    sql: `
      ALTER TABLE game_memories ADD COLUMN IF NOT EXISTS tags JSONB DEFAULT '[]';
    `
  },
  {
    version: "20260528193734",
    name: "add_world_time_to_games",
    sql: `
      ALTER TABLE games ADD COLUMN IF NOT EXISTS world_time JSONB DEFAULT NULL;
    `
  },
  {
    version: "20260528193735",
    name: "create_session_logs_table",
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
    `
  },
  {
    version: "20260528200858",
    name: "create_active_effects_table",
    sql: `
      CREATE TABLE IF NOT EXISTS active_effects (
        id                       UUID PRIMARY KEY,
        game_slug                TEXT NOT NULL,
        target_type              TEXT NOT NULL,
        target                   TEXT NOT NULL,
        name                     TEXT NOT NULL,
        source_type              TEXT,
        source                   TEXT,
        concentration            BOOLEAN NOT NULL DEFAULT FALSE,
        concentration_owner_type TEXT,
        concentration_owner      TEXT,
        duration_rounds          INTEGER NOT NULL DEFAULT -1,
        expires_at_round         INTEGER,
        modifiers                JSONB NOT NULL DEFAULT '[]',
        notes                    TEXT,
        created_at               TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS active_effects_game_slug_idx
        ON active_effects (game_slug);
      CREATE INDEX IF NOT EXISTS active_effects_target_idx
        ON active_effects (game_slug, target_type, target);
      CREATE INDEX IF NOT EXISTS active_effects_conc_owner_idx
        ON active_effects (game_slug, concentration_owner_type, concentration_owner);
    `
  },
  {
    version: "20260528203400",
    name: "add_end_on_save_to_active_effects",
    sql: `
      ALTER TABLE active_effects ADD COLUMN IF NOT EXISTS end_on_save JSONB DEFAULT NULL;
    `
  }
];
var _confirmed = false;
async function ensureMigrations(userSettings2) {
  if (_confirmed) return;
  const { externalDbUrl, externalDbKey } = userSettings2;
  const rpcUrl = `${externalDbUrl}/rest/v1/rpc/execute_migration_sql`;
  const headers = {
    "apikey": externalDbKey,
    "Authorization": `Bearer ${externalDbKey}`,
    "Content-Type": "application/json"
  };
  const execute = async (sql) => {
    const res = await fetch(rpcUrl, {
      method: "POST",
      headers,
      body: JSON.stringify({ sql, is_query: false })
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({ message: res.statusText }));
      throw new Error(`SQL failed: ${body.message ?? body.hint ?? JSON.stringify(body)}`);
    }
  };
  const query = async (sql) => {
    const res = await fetch(rpcUrl, {
      method: "POST",
      headers,
      body: JSON.stringify({ sql, is_query: true })
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
  const applied = await query("SELECT version FROM schema_migrations ORDER BY version");
  const appliedVersions = new Set(applied.map((r) => r.version));
  let appliedCount = 0;
  for (const migration of MIGRATIONS) {
    if (appliedVersions.has(migration.version)) continue;
    await execute(migration.sql);
    await execute(
      `INSERT INTO schema_migrations (version, name) VALUES ('${migration.version}', '${migration.name}') ON CONFLICT (version) DO NOTHING`
    );
    appliedCount++;
  }
  if (appliedCount > 0) {
    await execute(`NOTIFY pgrst, 'reload schema'`);
    await new Promise((r) => setTimeout(r, 500));
  }
  _confirmed = true;
}

// src/functions/advance_time.js
async function advance_time(params, userSettings2) {
  await ensureMigrations(userSettings2);
  const { game, minutes, note } = params;
  const store = new SupabaseStore(userSettings2.externalDbUrl, userSettings2.externalDbKey);
  const gameRecord = await store.get("games", game);
  if (!gameRecord) {
    return `No game found with slug "${game}".`;
  }
  const current = gameRecord.world_time ?? { day: 1, hour: 0, minute: 0, note: null };
  const totalMinutes = current.day * 1440 + current.hour * 60 + current.minute + minutes;
  const newDay = Math.floor(totalMinutes / 1440);
  const dayRemainder = totalMinutes % 1440;
  const newHour = Math.floor(dayRemainder / 60);
  const newMinute = dayRemainder % 60;
  const world_time = {
    day: newDay,
    hour: newHour,
    minute: newMinute,
    note: note ?? null
  };
  await store.patch("games", gameRecord.id, { world_time });
  const fromStr = formatTime(current);
  const toStr = formatTime(world_time);
  const deltaStr = formatDelta(minutes);
  const noteStr = note ? ` \u2014 ${note}` : "";
  return `Time advanced by ${deltaStr}. ${fromStr} \u2192 ${toStr}.${noteStr}`;
}
function formatTime(t) {
  return `Day ${t.day}, ${String(t.hour).padStart(2, "0")}:${String(t.minute).padStart(2, "0")}`;
}
function formatDelta(minutes) {
  if (minutes < 60) return `${minutes} minute${minutes !== 1 ? "s" : ""}`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  const hStr = `${h} hour${h !== 1 ? "s" : ""}`;
  const mStr = m > 0 ? ` ${m} minute${m !== 1 ? "s" : ""}` : "";
  return hStr + mStr;
}

// src/lib/effects.js
async function loadEffectsForEntity(store, game_slug, target_type, target) {
  return store.list("active_effects", { game_slug, target_type, target });
}
async function clearConcentrationEffects(store, game_slug, concentration_owner_type, concentration_owner) {
  return store.deleteWhere("active_effects", {
    game_slug,
    concentration_owner_type,
    concentration_owner,
    concentration: true
  });
}
async function expireEffects(userSettings2, game_slug, upToRound) {
  const { externalDbUrl, externalDbKey } = userSettings2;
  const headers = {
    apikey: externalDbKey,
    Authorization: `Bearer ${externalDbKey}`,
    "Content-Type": "application/json",
    Prefer: "return=representation"
  };
  const url = `${externalDbUrl}/rest/v1/active_effects?game_slug=eq.${encodeURIComponent(game_slug)}&expires_at_round=not.is.null&expires_at_round=lte.${upToRound}`;
  const res = await fetch(url, { method: "DELETE", headers });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(`Failed to expire effects: ${body.message ?? res.statusText}`);
  }
  return res.json();
}

// src/lib/saves.js
var ABILITY_COLUMNS = {
  Strength: "strength",
  Dexterity: "dexterity",
  Constitution: "constitution",
  Intelligence: "intelligence",
  Wisdom: "wisdom",
  Charisma: "charisma"
};
function saveBonus(record, ability) {
  const abilityCol = ABILITY_COLUMNS[ability];
  const score = (abilityCol ? record[abilityCol] : void 0) ?? 10;
  const mod = Math.floor((score - 10) / 2);
  const pb = record.pb ?? 0;
  const proficiencies = record.proficiencies ?? [];
  const isProficient = proficiencies.some(
    (p) => p.toLowerCase() === `${ability.toLowerCase()} saving throws`
  );
  return { bonus: mod + (isProficient ? pb : 0), isProficient };
}
function signedBonus(bonus) {
  return bonus >= 0 ? `+${bonus}` : `${bonus}`;
}

// src/lib/dice.js
var DiceParser = class {
  constructor() {
    this.position = 0;
    this.input = "";
    this.rollFn = (sides) => Math.floor(Math.random() * sides) + 1;
    this.groupRollFn = void 0;
    this.groups_ = [];
    this.MAX_NUMBER = 1e6;
    this.MAX_DICE_COUNT = 1e3;
    this.MAX_DICE_SIDES = 1e4;
  }
  parse(expression, rollFn, groupRollFn) {
    this.input = expression.toLowerCase().replace(/\s+/g, "");
    this.position = 0;
    this.rollFn = rollFn ?? ((sides) => Math.floor(Math.random() * sides) + 1);
    this.groupRollFn = groupRollFn;
    this.groups_ = [];
    try {
      const result = this.parseExpression();
      if (this.position < this.input.length) {
        throw new Error(`Unexpected character at position ${this.position}: '${this.input[this.position]}'`);
      }
      return { ...result, groups: [...this.groups_] };
    } catch (error) {
      throw new Error(`Parse error: ${error.message}`);
    }
  }
  listGroups(expression) {
    const groups = [];
    try {
      this.parse(expression, void 0, (expr) => {
        groups.push(expr);
        return 1;
      });
    } catch {
    }
    return groups;
  }
  parseExpression() {
    let left = this.parseTerm();
    while (this.position < this.input.length) {
      const operator = this.input[this.position];
      if (operator === "+" || operator === "-") {
        this.position++;
        const right = this.parseTerm();
        left = this.combineResults(left, right, operator);
      } else {
        break;
      }
    }
    return left;
  }
  parseTerm() {
    let left = this.parseFactor();
    while (this.position < this.input.length) {
      const char = this.peek();
      if (char === "*" || char === "\xD7" || char === "\xB7") {
        this.position++;
        const right = this.parseFactor();
        left = this.multiplyResults(left, right);
      } else {
        break;
      }
    }
    return left;
  }
  parseFactor() {
    if (this.peek() === "-") {
      const after = this.input.slice(this.position + 1);
      if (after.startsWith("(") || after.startsWith("min(") || after.startsWith("max(")) {
        this.position++;
        const inner = this.parseFactor();
        return { ...inner, total: -inner.total, simplified: `-${inner.simplified}`, expression: `-${inner.expression}` };
      }
    }
    const remaining = this.input.slice(this.position);
    if (remaining.startsWith("min(") || remaining.startsWith("max(")) {
      const fn = remaining.startsWith("min(") ? "min" : "max";
      this.position += fn.length + 1;
      const args = this.parseFunctionArgs(fn);
      if (this.peek() !== ")") throw new Error(`Missing closing parenthesis after ${fn}()`);
      this.position++;
      const totals = args.map((a) => a.total);
      const total = fn === "min" ? Math.min(...totals) : Math.max(...totals);
      return {
        total,
        groups: [],
        expression: `${fn}(${args.map((a) => a.expression).join(", ")})`,
        simplified: `${fn}(${args.map((a) => a.simplified).join(", ")})`
      };
    }
    if (this.peek() === "(") {
      this.position++;
      const result = this.parseExpression();
      if (this.peek() !== ")") throw new Error("Missing closing parenthesis");
      this.position++;
      return { ...result, simplified: `(${result.simplified})`, expression: `(${result.expression})` };
    }
    return this.parseDiceOrNumber();
  }
  parseFunctionArgs(fn) {
    const args = [this.parseExpression()];
    while (this.peek() === ",") {
      this.position++;
      args.push(this.parseExpression());
    }
    if (args.length < 2) throw new Error(`${fn}() requires at least 2 arguments`);
    return args;
  }
  parseDiceOrNumber() {
    const start = this.position;
    let negative = false;
    if (this.peek() === "-") {
      negative = true;
      this.position++;
    }
    const count = this.parseNumber();
    if (this.peek() === "d") {
      this.position++;
      if (this.peek() === "%") {
        this.position++;
        return this.rollDice(count || 1, 100, { negative });
      }
      if (this.peek() === "f") {
        this.position++;
        return this.rollFudgeDice(count || 1, { negative });
      }
      const sides = this.parseNumber();
      if (!sides) throw new Error("Missing number of sides after 'd'");
      const modifiers = this.parseModifiers();
      return this.rollDice(count || 1, sides, { ...modifiers, negative });
    }
    if (count === null) throw new Error(`Expected number or dice notation at position ${start}`);
    const value = negative ? -count : count;
    return { total: value, groups: [], expression: String(value), simplified: String(value) };
  }
  parseModifiers() {
    const modifiers = {};
    while (this.position < this.input.length) {
      const char = this.peek();
      if (char === "k") {
        if (modifiers.keep !== void 0) throw new Error("Duplicate 'k' modifier");
        this.position++;
        modifiers.keep = this.parseNumber();
        if (!modifiers.keep) throw new Error("Missing number after 'k'");
      } else if (char === "d" && /\d/.test(this.peek(1))) {
        if (modifiers.drop !== void 0) throw new Error("Duplicate 'd' modifier");
        this.position++;
        modifiers.drop = this.parseNumber();
        if (!modifiers.drop) throw new Error("Missing number after 'd'");
      } else if (char === "!" || char === "e") {
        if (modifiers.explode) throw new Error("Duplicate explode modifier");
        this.position++;
        modifiers.explode = true;
        if (char === "!" && this.peek() === "!") {
          this.position++;
          modifiers.compound = true;
        }
        if (/\d/.test(this.peek())) modifiers.explodeOn = this.parseNumber();
      } else if (char === "r") {
        if (modifiers.reroll !== void 0) throw new Error("Duplicate 'r' modifier");
        this.position++;
        modifiers.reroll = this.parseNumber();
        if (!modifiers.reroll) throw new Error("Missing number after 'r'");
      } else {
        break;
      }
    }
    return modifiers;
  }
  parseNumber() {
    const start = this.position;
    while (this.position < this.input.length && /\d/.test(this.input[this.position])) this.position++;
    if (start === this.position) return null;
    const num = parseInt(this.input.slice(start, this.position));
    if (num > this.MAX_NUMBER) throw new Error(`Number too large (max ${this.MAX_NUMBER.toLocaleString()})`);
    return num;
  }
  peek(offset = 0) {
    return this.input[this.position + offset] || "";
  }
  rollDice(count, sides, options = {}) {
    if (count <= 0 || count > this.MAX_DICE_COUNT) throw new Error(`Dice count must be between 1 and ${this.MAX_DICE_COUNT}`);
    if (sides <= 0 || sides > this.MAX_DICE_SIDES) throw new Error(`Dice sides must be between 1 and ${this.MAX_DICE_SIDES}`);
    if (count * sides > this.MAX_NUMBER) throw new Error("Total possible outcomes too large");
    let absExpr = `${count}d${sides}`;
    if (options.keep) absExpr += `k${options.keep}`;
    if (options.drop) absExpr += `d${options.drop}`;
    if (options.explode) {
      if (options.compound) {
        absExpr += options.explodeOn ? `!!${options.explodeOn}` : "!!";
      } else {
        absExpr += options.explodeOn ? `e${options.explodeOn}` : "!";
      }
    }
    if (options.reroll) absExpr += `r${options.reroll}`;
    const expr = options.negative ? `-${absExpr}` : absExpr;
    if (this.groupRollFn) {
      const userTotal = this.groupRollFn(absExpr);
      const total2 = options.negative ? -userTotal : userTotal;
      this.groups_.push({ expression: absExpr, display: String(userTotal), total: userTotal });
      return { total: total2, groups: [], expression: expr, simplified: String(total2) };
    }
    const dieTotals = [];
    const dieDisplays = [];
    for (let i = 0; i < count; i++) {
      let roll = this.rollFn(sides);
      let rerollPrefix = "";
      if (options.reroll && roll <= options.reroll) {
        const newRoll = this.rollFn(sides);
        rerollPrefix = `${roll}\u2192`;
        roll = newRoll;
      }
      let display = `${rerollPrefix}${roll}`;
      let dieTotal = roll;
      if (options.explode) {
        const explodeThreshold = options.explodeOn || sides;
        let explodeCount = 0;
        let capped = false;
        if (options.compound) {
          let currentRoll = roll;
          while (currentRoll >= explodeThreshold) {
            if (explodeCount >= 100) {
              capped = true;
              break;
            }
            currentRoll = this.rollFn(sides);
            dieTotal += currentRoll;
            explodeCount++;
          }
          if (explodeCount > 0) display = `${rerollPrefix}${dieTotal}${capped ? "\u2026" : ""}`;
        } else {
          const explosions = [];
          while (roll >= explodeThreshold) {
            if (explodeCount >= 100) {
              capped = true;
              break;
            }
            roll = this.rollFn(sides);
            dieTotal += roll;
            explosions.push(roll);
            explodeCount++;
          }
          if (explosions.length > 0) display += `!${explosions.join("!")}${capped ? "\u2026" : ""}`;
        }
      }
      dieTotals.push(dieTotal);
      dieDisplays.push(display);
    }
    let finalTotals = [...dieTotals];
    let finalDisplays = [...dieDisplays];
    if (options.keep) {
      const indexed = dieTotals.map((v, i) => ({ v, display: dieDisplays[i] }));
      indexed.sort((a, b) => b.v - a.v);
      const kept = indexed.slice(0, options.keep);
      finalTotals = kept.map((x) => x.v);
      finalDisplays = kept.map((x) => x.display);
    } else if (options.drop) {
      const indexed = dieTotals.map((v, i) => ({ v, display: dieDisplays[i] }));
      indexed.sort((a, b) => a.v - b.v);
      const remaining = indexed.slice(options.drop);
      finalTotals = remaining.map((x) => x.v);
      finalDisplays = remaining.map((x) => x.display);
    }
    const sum = finalTotals.reduce((s, r) => s + r, 0);
    const total = options.negative ? -sum : sum;
    let groupDisplay = `[${dieDisplays.join(", ")}]`;
    if (options.keep || options.drop) groupDisplay += ` \u2192 [${finalDisplays.join(", ")}]`;
    groupDisplay += ` = ${sum}`;
    this.groups_.push({ expression: absExpr, display: groupDisplay, total: sum });
    return { total, groups: [], expression: expr, simplified: String(total) };
  }
  rollFudgeDice(count, options = {}) {
    if (count <= 0 || count > this.MAX_DICE_COUNT) throw new Error(`Dice count must be between 1 and ${this.MAX_DICE_COUNT}`);
    const absExpr = `${count}dF`;
    const expr = options.negative ? `-${absExpr}` : absExpr;
    if (this.groupRollFn) {
      const userTotal = this.groupRollFn(absExpr);
      const total2 = options.negative ? -userTotal : userTotal;
      this.groups_.push({ expression: absExpr, display: String(userTotal), total: userTotal });
      return { total: total2, groups: [], expression: expr, simplified: String(total2) };
    }
    const rolls = [];
    for (let i = 0; i < count; i++) rolls.push(this.rollFn(3) - 2);
    const sum = rolls.reduce((s, r) => s + r, 0);
    const total = options.negative ? -sum : sum;
    const symbols = rolls.map((r) => r === -1 ? "[-]" : r === 0 ? "[ ]" : "[+]");
    this.groups_.push({ expression: absExpr, display: `${symbols.join(" ")} = ${sum}`, total: sum });
    return { total, groups: [], expression: expr, simplified: String(total) };
  }
  combineResults(left, right, operator) {
    const total = operator === "+" ? left.total + right.total : left.total - right.total;
    return {
      total,
      groups: [],
      expression: `${left.expression}${operator}${right.expression}`,
      simplified: `${left.simplified} ${operator} ${right.simplified}`
    };
  }
  multiplyResults(left, right) {
    return {
      total: left.total * right.total,
      groups: [],
      expression: `${left.expression}\xD7${right.expression}`,
      simplified: `${left.simplified} \xD7 ${right.simplified}`
    };
  }
};
function splitExpressions(expr) {
  const parts = [];
  let depth = 0, start = 0;
  for (let i = 0; i < expr.length; i++) {
    if (expr[i] === "(") depth++;
    else if (expr[i] === ")") depth--;
    else if (expr[i] === "," && depth === 0) {
      const part = expr.slice(start, i).trim();
      if (part) parts.push(part);
      start = i + 1;
    }
  }
  const last = expr.slice(start).trim();
  if (last) parts.push(last);
  return parts.length ? parts : [expr.trim()];
}
function formatTransparent(result) {
  const lines = result.groups.map((g) => `${g.expression}: ${g.display}`);
  const isSimple = result.simplified === String(result.total);
  lines.push(isSimple ? `${result.expression} = ${result.total}` : `${result.expression} = ${result.simplified} = ${result.total}`);
  return lines.join("\n");
}

// src/functions/advance_turn.js
async function advance_turn(params, userSettings2) {
  await ensureMigrations(userSettings2);
  const { game } = params;
  const store = new SupabaseStore(userSettings2.externalDbUrl, userSettings2.externalDbKey);
  const gameRecord = await store.get("games", game);
  if (!gameRecord) {
    return `No game found with slug "${game}".`;
  }
  if (!gameRecord.combat_active) {
    return `No active combat in "${game}". Start one with start_combat.`;
  }
  const turnOrder = gameRecord.turn_order ?? [];
  if (turnOrder.length === 0) {
    return `Turn order is empty. Something went wrong \u2014 try end_combat and start_combat again.`;
  }
  const currentIndex = gameRecord.active_combatant_index ?? 0;
  const nextIndex = (currentIndex + 1) % turnOrder.length;
  const newRound = nextIndex === 0 ? gameRecord.combat_round + 1 : gameRecord.combat_round;
  const endingCombatant = turnOrder[currentIndex];
  const saveLines = [];
  if (endingCombatant?.slug && endingCombatant?.entity_type) {
    const effects = await loadEffectsForEntity(
      store,
      game,
      endingCombatant.entity_type,
      endingCombatant.slug
    );
    const saveEffects = effects.filter((e) => e.end_on_save);
    if (saveEffects.length > 0) {
      const table = endingCombatant.entity_type === "character" ? "characters" : "npcs";
      const entityRecord = await store.get(table, endingCombatant.slug, game);
      if (entityRecord) {
        const parser = new DiceParser();
        for (const effect of saveEffects) {
          const { dc, ability } = effect.end_on_save;
          if (!ABILITY_COLUMNS[ability]) continue;
          const { bonus } = saveBonus(entityRecord, ability);
          const signed = signedBonus(bonus);
          const roll = parser.parse(`1d20${signed}`);
          const d20 = roll.total - bonus;
          const total = roll.total;
          const passed = total >= dc;
          if (passed) {
            await store.delete("active_effects", effect.id);
            saveLines.push(
              `  ${endingCombatant.name} saves vs ${effect.name} (DC ${dc} ${ability}): ${d20}${signed} = ${total} \u2014 PASS, effect ended`
            );
          } else {
            saveLines.push(
              `  ${endingCombatant.name} saves vs ${effect.name} (DC ${dc} ${ability}): ${d20}${signed} = ${total} \u2014 FAIL`
            );
          }
        }
      }
    }
  }
  const updatedTurnOrder = turnOrder.map(
    (c, i) => i === nextIndex ? { ...c, reaction_available: true } : c
  );
  await store.patch("games", gameRecord.id, {
    active_combatant_index: nextIndex,
    combat_round: newRound,
    turn_order: updatedTurnOrder
  });
  const expired = await expireEffects(userSettings2, game, newRound);
  const current = turnOrder[currentIndex];
  const next = updatedTurnOrder[nextIndex];
  const roundNote = nextIndex === 0 ? `
--- Round ${newRound} begins ---` : "";
  const saveNote = saveLines.length > 0 ? `
End-of-turn saves:
${saveLines.join("\n")}` : "";
  const expiredNote = expired.length > 0 ? `
Expired: ${expired.map((e) => `${e.name} on ${e.target}`).join(", ")}` : "";
  return `${current.name} ends their turn.${roundNote}${saveNote}${expiredNote}
Now acting: ${next.name} (${next.entity_type}) \u2014 Round ${newRound}, position ${nextIndex + 1}/${turnOrder.length}.`;
}

// src/functions/apply_condition.js
var MAX_RETRIES = 5;
async function apply_condition(params, userSettings2) {
  await ensureMigrations(userSettings2);
  const { game, entity_type, entity, condition } = params;
  const table = entity_type === "character" ? "characters" : "npcs";
  const store = new SupabaseStore(userSettings2.externalDbUrl, userSettings2.externalDbKey);
  const gameRecord = await store.get("games", game);
  if (!gameRecord) {
    return `No game found with slug "${game}".`;
  }
  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    const record = await store.get(table, entity, game);
    if (!record || record.game_slug !== game) {
      return `No ${entity_type} found with identifier "${entity}" in game "${game}".`;
    }
    const immunities = record.condition_immunities ?? [];
    const baseCondition = condition.startsWith("Exhaustion") ? "Exhaustion" : condition;
    if (immunities.includes(baseCondition)) {
      return `${record.name} is immune to ${condition} and cannot be affected.`;
    }
    const current = record.conditions ?? [];
    if (current.includes(condition)) {
      return `${record.name} already has the ${condition} condition \u2014 no change.`;
    }
    const updated = await store.patch(table, record.id, { conditions: [...current, condition] }, record.updated_at);
    if (updated === null) continue;
    const all = [...current, condition];
    return `${record.name} is now ${condition}. Active conditions: ${all.join(", ")}.`;
  }
  return `Could not apply condition to "${entity}" after ${MAX_RETRIES} attempts due to concurrent updates. Please retry.`;
}

// src/functions/apply_damage.js
var MAX_RETRIES2 = 5;
function resolveDamage(amount, damageType, record) {
  if (!damageType) return amount;
  const immunities = record.damage_immunities ?? [];
  const resistances = record.damage_resistances ?? [];
  const vulnerabilities = record.damage_vulnerabilities ?? [];
  if (immunities.includes(damageType)) return 0;
  if (resistances.includes(damageType)) return Math.floor(amount / 2);
  if (vulnerabilities.includes(damageType)) return amount * 2;
  return amount;
}
async function apply_damage(params, userSettings2) {
  await ensureMigrations(userSettings2);
  const { game, entity_type, entity, amount, damage_type } = params;
  const table = entity_type === "character" ? "characters" : "npcs";
  const store = new SupabaseStore(userSettings2.externalDbUrl, userSettings2.externalDbKey);
  for (let attempt = 0; attempt < MAX_RETRIES2; attempt++) {
    const record = await store.get(table, entity, game);
    if (!record || record.game_slug !== game) {
      return `No ${entity_type} found with identifier "${entity}" in game "${game}".`;
    }
    const effective = resolveDamage(amount, damage_type, record);
    if (damage_type && effective === 0) {
      return `${record.name} is immune to ${damage_type} damage \u2014 no damage taken.`;
    }
    const tempAbsorbed = Math.min(record.temporary_hp, effective);
    const remaining = effective - tempAbsorbed;
    const new_temporary_hp = record.temporary_hp - tempAbsorbed;
    const new_current_hp = Math.max(0, record.current_hp - remaining);
    const hp_lost = record.current_hp - new_current_hp;
    const excessDamage = remaining - record.current_hp;
    const instantDeath = entity_type === "character" && new_current_hp === 0 && record.max_hp != null && excessDamage >= record.max_hp;
    const patch = {
      current_hp: new_current_hp,
      temporary_hp: new_temporary_hp
    };
    if (new_current_hp === 0 && entity_type === "character") {
      const conditions = record.conditions ?? [];
      const condImmunities = record.condition_immunities ?? [];
      if (!conditions.includes("Unconscious") && !condImmunities.includes("Unconscious")) {
        patch.conditions = [...conditions, "Unconscious"];
      }
    }
    if (new_current_hp === 0 && record.concentration) {
      patch.concentration = null;
    }
    const updated = await store.patch(table, record.id, patch, record.updated_at);
    if (updated === null) continue;
    const parts = [];
    if (damage_type && effective !== amount) {
      const modifier = effective < amount ? "resistant" : "vulnerable";
      parts.push(`${record.name} is ${modifier} to ${damage_type}: ${amount} \u2192 ${effective} damage.`);
    } else {
      const typeStr = damage_type ? ` ${damage_type}` : "";
      parts.push(`${record.name} takes ${effective}${typeStr} damage.`);
    }
    if (tempAbsorbed > 0) {
      parts.push(`(${tempAbsorbed} absorbed by temporary HP)`);
    }
    const tempStr = new_temporary_hp > 0 ? `, Temp HP: ${new_temporary_hp}` : "";
    parts.push(`HP: ${new_current_hp}/${record.max_hp}${tempStr}.`);
    if (new_current_hp === 0) {
      if (entity_type === "character") {
        if (instantDeath) {
          parts.push(`Instant death \u2014 excess damage (${excessDamage}) equals or exceeds maximum HP (${record.max_hp}).`);
        } else {
          parts.push("Unconscious \u2014 rolling death saves.");
        }
      } else {
        parts.push("Dead.");
      }
      if (record.concentration) {
        parts.push(`Concentration on ${record.concentration.spell} broken.`);
      }
    } else if (hp_lost > 0 && record.concentration) {
      const concDC = Math.max(10, Math.ceil(hp_lost / 2));
      parts.push(`Concentration check required! DC ${concDC} Constitution save to maintain ${record.concentration.spell}.`);
    }
    return parts.join(" ");
  }
  return `Could not apply damage to "${entity}" after ${MAX_RETRIES2} attempts due to concurrent updates. Please retry.`;
}

// src/functions/apply_damage_bulk.js
var MAX_RETRIES3 = 5;
function resolveDamage2(amount, damageType, record) {
  if (!damageType || amount === 0) return amount;
  const immunities = record.damage_immunities ?? [];
  const resistances = record.damage_resistances ?? [];
  const vulnerabilities = record.damage_vulnerabilities ?? [];
  if (immunities.includes(damageType)) return 0;
  if (resistances.includes(damageType)) return Math.floor(amount / 2);
  if (vulnerabilities.includes(damageType)) return amount * 2;
  return amount;
}
async function apply_damage_bulk(params, userSettings2) {
  await ensureMigrations(userSettings2);
  const { game, damage_type, base_amount, targets } = params;
  const store = new SupabaseStore(userSettings2.externalDbUrl, userSettings2.externalDbKey);
  const gameRecord = await store.get("games", game);
  if (!gameRecord) {
    return `No game found with slug "${game}".`;
  }
  const typeStr = damage_type ? ` ${damage_type}` : "";
  const lines = [`Bulk${typeStr} damage (base ${base_amount}):`];
  for (const target of targets) {
    const table = target.entity_type === "character" ? "characters" : "npcs";
    const afterSave = Math.floor(base_amount * target.multiplier);
    let handled = false;
    for (let attempt = 0; attempt < MAX_RETRIES3; attempt++) {
      const record = await store.get(table, target.entity, game);
      if (!record || record.game_slug !== game) {
        lines.push(`  ${target.entity}: not found.`);
        handled = true;
        break;
      }
      const effective = resolveDamage2(afterSave, damage_type, record);
      if (effective === 0) {
        const reason = afterSave === 0 ? "no damage (save)" : `immune to ${damage_type}`;
        lines.push(`  ${record.name}: ${reason}. HP: ${record.current_hp}/${record.max_hp}.`);
        handled = true;
        break;
      }
      const tempAbsorbed = Math.min(record.temporary_hp, effective);
      const remaining = effective - tempAbsorbed;
      const new_temporary_hp = record.temporary_hp - tempAbsorbed;
      const new_current_hp = Math.max(0, record.current_hp - remaining);
      const hp_lost = record.current_hp - new_current_hp;
      const excessDamage = remaining - record.current_hp;
      const instantDeath = target.entity_type === "character" && new_current_hp === 0 && record.max_hp != null && excessDamage >= record.max_hp;
      const patch = {
        current_hp: new_current_hp,
        temporary_hp: new_temporary_hp
      };
      if (new_current_hp === 0 && target.entity_type === "character") {
        const conditions = record.conditions ?? [];
        const condImmunities = record.condition_immunities ?? [];
        if (!conditions.includes("Unconscious") && !condImmunities.includes("Unconscious")) {
          patch.conditions = [...conditions, "Unconscious"];
        }
      }
      if (new_current_hp === 0 && record.concentration) {
        patch.concentration = null;
      }
      const updated = await store.patch(table, record.id, patch, record.updated_at);
      if (updated === null) continue;
      const resultParts = [];
      const saveNote = target.multiplier === 0.5 ? " [save: half]" : target.multiplier === 0 ? " [immune]" : "";
      if (afterSave !== effective) {
        resultParts.push(`${afterSave}\u2192${effective} damage`);
      } else {
        resultParts.push(`${effective} damage`);
      }
      if (tempAbsorbed > 0) resultParts.push(`${tempAbsorbed} absorbed by temp HP`);
      const tempStr = new_temporary_hp > 0 ? `, Temp HP: ${new_temporary_hp}` : "";
      resultParts.push(`HP: ${new_current_hp}/${record.max_hp}${tempStr}`);
      if (new_current_hp === 0) {
        if (target.entity_type === "character") {
          resultParts.push(instantDeath ? "INSTANT DEATH" : "UNCONSCIOUS");
        } else {
          resultParts.push("DEAD");
        }
        if (record.concentration) {
          resultParts.push(`concentration on ${record.concentration.spell} broken`);
        }
      } else if (hp_lost > 0 && record.concentration) {
        const concDC = Math.max(10, Math.ceil(hp_lost / 2));
        resultParts.push(`Concentration DC ${concDC} Con save`);
      }
      lines.push(`  ${record.name}${saveNote}: ${resultParts.join(", ")}.`);
      handled = true;
      break;
    }
    if (!handled) {
      lines.push(`  ${target.entity}: failed after ${MAX_RETRIES3} retries \u2014 please retry.`);
    }
  }
  return lines.join("\n");
}

// src/functions/apply_effect.js
async function apply_effect(params, userSettings2) {
  await ensureMigrations(userSettings2);
  const {
    game,
    targets,
    name: effectName,
    source_type,
    source,
    concentration = false,
    duration_rounds = -1,
    end_on_save,
    notes
  } = params;
  const store = new SupabaseStore(userSettings2.externalDbUrl, userSettings2.externalDbKey);
  const gameRecord = await store.get("games", game);
  if (!gameRecord) return `No game found with slug "${game}".`;
  let concOwnerType = null;
  let concOwner = null;
  if (concentration) {
    concOwnerType = source_type ?? null;
    concOwner = source ?? null;
    if (source && (source_type === "character" || source_type === "npc")) {
      const sourceTable = source_type === "character" ? "characters" : "npcs";
      const sourceRecord = await store.get(sourceTable, source, game);
      if (sourceRecord) concOwner = sourceRecord.slug;
    }
  }
  const expiresAtRound = gameRecord.combat_active && duration_rounds !== -1 ? gameRecord.combat_round + duration_rounds : null;
  const results = [];
  for (const t of targets) {
    const { entity_type, entity } = t;
    const table = entity_type === "character" ? "characters" : "npcs";
    const record = await store.get(table, entity, game);
    if (!record || record.game_slug !== game) {
      results.push(`  ${entity} (${entity_type}): not found in game "${game}"`);
      continue;
    }
    await store.insert("active_effects", {
      id: crypto.randomUUID(),
      game_slug: game,
      target_type: entity_type,
      target: record.slug,
      name: effectName,
      source_type: source_type ?? null,
      source: source ?? null,
      concentration,
      concentration_owner_type: concOwnerType,
      concentration_owner: concOwner,
      duration_rounds,
      expires_at_round: expiresAtRound,
      end_on_save: end_on_save ?? null,
      modifiers: [],
      notes: notes ?? null
    });
    const parts = [];
    if (duration_rounds === -1) {
      parts.push("indefinite duration");
    } else if (expiresAtRound != null) {
      parts.push(`${duration_rounds}r (expires after round ${expiresAtRound})`);
    } else {
      parts.push(`${duration_rounds}r (timer starts when combat begins)`);
    }
    if (end_on_save) {
      parts.push(`save to end: DC ${end_on_save.dc} ${end_on_save.ability} at end of their turn`);
    }
    if (concentration) {
      parts.push(concOwner ? `concentration: ${concOwner}` : "concentration");
    }
    results.push(`  ${record.name} (${entity_type}): "${effectName}" \u2014 ${parts.join(" | ")}`);
  }
  return `Applied effect:
${results.join("\n")}`;
}

// src/functions/apply_healing.js
var MAX_RETRIES4 = 5;
async function apply_healing(params, userSettings2) {
  await ensureMigrations(userSettings2);
  const { game, entity_type, entity, amount, temporary } = params;
  const table = entity_type === "character" ? "characters" : "npcs";
  const store = new SupabaseStore(userSettings2.externalDbUrl, userSettings2.externalDbKey);
  for (let attempt = 0; attempt < MAX_RETRIES4; attempt++) {
    const record = await store.get(table, entity, game);
    if (!record || record.game_slug !== game) {
      return `No ${entity_type} found with identifier "${entity}" in game "${game}".`;
    }
    if (temporary) {
      const new_temporary_hp = Math.max(record.temporary_hp, amount);
      if (new_temporary_hp === record.temporary_hp) {
        return `${record.name} already has ${record.temporary_hp} temporary HP, which is at least as high \u2014 no change.`;
      }
      const updated2 = await store.patch(table, record.id, { temporary_hp: new_temporary_hp }, record.updated_at);
      if (updated2 === null) continue;
      return `${record.name} gains ${amount} temporary HP. Temp HP: ${new_temporary_hp}.`;
    }
    const new_current_hp = Math.min(record.max_hp, record.current_hp + amount);
    const actual = new_current_hp - record.current_hp;
    const patch = { current_hp: new_current_hp };
    if (record.current_hp === 0 && new_current_hp > 0 && entity_type === "character") {
      patch.death_save_successes = 0;
      patch.death_save_failures = 0;
    }
    const updated = await store.patch(table, record.id, patch, record.updated_at);
    if (updated === null) continue;
    const overHeal = amount > actual ? ` (${amount - actual} wasted, already at max)` : "";
    const deathSaveNote = patch.death_save_successes !== void 0 ? " Death saves cleared." : "";
    return `${record.name} recovers ${actual} HP${overHeal}. HP: ${new_current_hp}/${record.max_hp}.${deathSaveNote}`;
  }
  return `Could not apply healing to "${entity}" after ${MAX_RETRIES4} attempts due to concurrent updates. Please retry.`;
}

// src/functions/clear_concentration.js
var MAX_RETRIES5 = 5;
async function clear_concentration(params, userSettings2) {
  await ensureMigrations(userSettings2);
  const { game, entity_type, entity } = params;
  const table = entity_type === "character" ? "characters" : "npcs";
  const store = new SupabaseStore(userSettings2.externalDbUrl, userSettings2.externalDbKey);
  for (let attempt = 0; attempt < MAX_RETRIES5; attempt++) {
    const record = await store.get(table, entity, game);
    if (!record || record.game_slug !== game) {
      return `No ${entity_type} found with identifier "${entity}" in game "${game}".`;
    }
    if (!record.concentration) {
      return `${record.name} is not concentrating on any spell.`;
    }
    const spell = record.concentration.spell;
    const updated = await store.patch(table, record.id, { concentration: null }, record.updated_at);
    if (updated === null) continue;
    await clearConcentrationEffects(store, game, entity_type, record.slug);
    return `${record.name} loses concentration on ${spell}.`;
  }
  return `Could not clear concentration for "${entity}" after ${MAX_RETRIES5} attempts due to concurrent updates. Please retry.`;
}

// src/functions/create_game.js
async function create_game(params, userSettings2) {
  await ensureMigrations(userSettings2);
  const { slug, name, description } = params;
  const store = new SupabaseStore(userSettings2.externalDbUrl, userSettings2.externalDbKey);
  try {
    await store.insert("games", { id: crypto.randomUUID(), slug, name, description });
  } catch (err) {
    if (err.code === "23505") {
      return `A game with slug "${slug}" already exists.`;
    }
    throw err;
  }
  return `Game "${name}" created with slug "${slug}".`;
}

// src/functions/delete_character.js
async function delete_character(params, userSettings2) {
  await ensureMigrations(userSettings2);
  const { game, slug } = params;
  const store = new SupabaseStore(userSettings2.externalDbUrl, userSettings2.externalDbKey);
  const existing = await store.get("characters", slug, game);
  if (!existing) {
    return `No character with slug "${slug}" found in game "${game}".`;
  }
  await store.delete("characters", existing.id);
  return `Character "${existing.name}" (${slug}) deleted from game "${game}".`;
}

// src/lib/elicit.js
var _backend = null;
function setElicitBackend(fn) {
  _backend = fn;
}
async function elicit(message) {
  if (_backend) {
    return { value: await _backend(message), available: true };
  }
  if (typeof window !== "undefined" && typeof window.prompt === "function") {
    return { value: window.prompt(message), available: true };
  }
  return { value: null, available: false };
}

// src/functions/delete_game.js
async function delete_game(params, userSettings2) {
  await ensureMigrations(userSettings2);
  const { slug, confirm_name } = params;
  const store = new SupabaseStore(userSettings2.externalDbUrl, userSettings2.externalDbKey);
  const existing = await store.get("games", slug);
  if (!existing) {
    return `No game with slug "${slug}" found.`;
  }
  if (confirm_name !== existing.name) {
    return `Deletion cancelled: "${confirm_name}" does not match the game name "${existing.name}". Pass the exact game name as confirm_name.`;
  }
  const { value: confirmation, available } = await elicit(
    `Type the game name to confirm permanent deletion:

"${existing.name}"`
  );
  if (available) {
    if (confirmation === null) return "Deletion cancelled.";
    if (confirmation !== existing.name) {
      return `Deletion cancelled: "${confirmation}" does not match the game name "${existing.name}".`;
    }
  }
  await Promise.all([
    store.deleteWhere("characters", { game_slug: slug }),
    store.deleteWhere("npcs", { game_slug: slug }),
    store.deleteWhere("game_memories", { game_slug: slug }),
    store.deleteWhere("session_logs", { game_slug: slug })
  ]);
  await store.delete("games", existing.id);
  return `Game "${existing.name}" (${slug}) deleted.`;
}

// src/functions/delete_memory.js
async function delete_memory(params, userSettings2) {
  await ensureMigrations(userSettings2);
  const { game, slug } = params;
  const store = new SupabaseStore(userSettings2.externalDbUrl, userSettings2.externalDbKey);
  const existing = await store.get("game_memories", slug, game);
  if (!existing) {
    return `No memory with slug "${slug}" found in game "${game}".`;
  }
  await store.delete("game_memories", existing.id);
  return `Memory "${existing.name}" (${slug}) deleted from game "${game}".`;
}

// src/functions/delete_npc.js
async function delete_npc(params, userSettings2) {
  await ensureMigrations(userSettings2);
  const { game, slug } = params;
  const store = new SupabaseStore(userSettings2.externalDbUrl, userSettings2.externalDbKey);
  const existing = await store.get("npcs", slug, game);
  if (!existing) {
    return `No NPC with slug "${slug}" found in game "${game}".`;
  }
  await store.delete("npcs", existing.id);
  return `NPC "${existing.name}" (${slug}) deleted from game "${game}".`;
}

// src/functions/end_combat.js
async function end_combat(params, userSettings2) {
  await ensureMigrations(userSettings2);
  const { game } = params;
  const store = new SupabaseStore(userSettings2.externalDbUrl, userSettings2.externalDbKey);
  const gameRecord = await store.get("games", game);
  if (!gameRecord) {
    return `No game found with slug "${game}".`;
  }
  if (!gameRecord.combat_active) {
    return `No active combat in "${game}" to end.`;
  }
  const round = gameRecord.combat_round;
  await store.patch("games", gameRecord.id, {
    combat_active: false,
    combat_round: 0,
    turn_order: [],
    active_combatant_index: 0
  });
  return `Combat ended after ${round} round${round !== 1 ? "s" : ""}. Initiative order cleared.`;
}

// src/lib/derived.js
var XP_THRESHOLDS = [
  0,
  0,
  300,
  900,
  2700,
  6500,
  14e3,
  23e3,
  34e3,
  48e3,
  64e3,
  85e3,
  1e5,
  12e4,
  14e4,
  165e3,
  195e3,
  225e3,
  265e3,
  305e3,
  355e3
];
function levelFromXp(xp) {
  if (typeof xp !== "number" || xp < 0) return null;
  let level = 1;
  for (let l = 20; l >= 1; l--) {
    if (xp >= XP_THRESHOLDS[l]) {
      level = l;
      break;
    }
  }
  return level;
}
function xpForNextLevel(level) {
  if (level == null || level >= 20) return null;
  return XP_THRESHOLDS[level + 1];
}
function pbForLevel(level) {
  if (!level || level < 1) return null;
  return Math.ceil(level / 4) + 1;
}
function abilityMod(score) {
  if (typeof score !== "number") return null;
  return Math.floor((score - 10) / 2);
}
var ABILITY_KEYS = ["strength", "dexterity", "constitution", "intelligence", "wisdom", "charisma"];
var ABILITY_SHORT = { strength: "str", dexterity: "dex", constitution: "con", intelligence: "int", wisdom: "wis", charisma: "cha" };
var SKILL_ABILITY = {
  "Acrobatics": "dexterity",
  "Animal Handling": "wisdom",
  "Arcana": "intelligence",
  "Athletics": "strength",
  "Deception": "charisma",
  "History": "intelligence",
  "Insight": "wisdom",
  "Intimidation": "charisma",
  "Investigation": "intelligence",
  "Medicine": "wisdom",
  "Nature": "intelligence",
  "Perception": "wisdom",
  "Performance": "charisma",
  "Persuasion": "charisma",
  "Religion": "intelligence",
  "Sleight of Hand": "dexterity",
  "Stealth": "dexterity",
  "Survival": "wisdom"
};
var SAVE_KEYS = {
  "Strength Save": "strength",
  "Dexterity Save": "dexterity",
  "Constitution Save": "constitution",
  "Intelligence Save": "intelligence",
  "Wisdom Save": "wisdom",
  "Charisma Save": "charisma"
};
function abilityMods(record) {
  const mods = {};
  for (const key of ABILITY_KEYS) {
    const m = abilityMod(record[key]);
    if (m !== null) mods[ABILITY_SHORT[key]] = m;
  }
  return mods;
}
function saveMods(record, pb, profSet) {
  const out = {};
  for (const [profName, abilityKey] of Object.entries(SAVE_KEYS)) {
    const m = abilityMod(record[abilityKey]);
    if (m === null) continue;
    out[ABILITY_SHORT[abilityKey]] = m + (pb && profSet.has(profName) ? pb : 0);
  }
  return out;
}
function skillMods(record, pb, profSet, expertiseSet) {
  const out = {};
  for (const [skill, abilityKey] of Object.entries(SKILL_ABILITY)) {
    const m = abilityMod(record[abilityKey]);
    if (m === null) continue;
    let bonus = m;
    if (pb) {
      if (expertiseSet.has(skill)) bonus += pb * 2;
      else if (profSet.has(skill)) bonus += pb;
    }
    out[skill] = bonus;
  }
  return out;
}
function computeDerived(record, opts = {}) {
  if (!record) return null;
  const derived = {};
  if (opts.includeLevel) {
    const storedLevel = record.level;
    const xpLevel = levelFromXp(record.xp);
    const level2 = storedLevel ?? xpLevel ?? null;
    if (level2 != null) derived.level = level2;
    if (xpLevel != null && storedLevel != null && xpLevel !== storedLevel) {
      derived.level_from_xp = xpLevel;
    }
    if (level2 != null && level2 < 20) {
      const next = xpForNextLevel(level2);
      derived.xp_for_next_level = next;
      if (typeof record.xp === "number") {
        derived.xp_to_next_level = Math.max(0, next - record.xp);
      }
    }
  }
  const level = record.level ?? (opts.includeLevel ? levelFromXp(record.xp) : null);
  const pb = record.pb ?? pbForLevel(level);
  if (pb != null) derived.pb = pb;
  const mods = abilityMods(record);
  if (Object.keys(mods).length > 0) derived.ability_modifiers = mods;
  if (mods.dex != null) derived.initiative = mods.dex;
  const profSet = new Set(record.proficiencies ?? []);
  const expertiseSet = new Set(record.expertise ?? []);
  const saves = saveMods(record, pb, profSet);
  if (Object.keys(saves).length > 0) derived.save_modifiers = saves;
  const skills = skillMods(record, pb, profSet, expertiseSet);
  if (Object.keys(skills).length > 0) derived.skill_modifiers = skills;
  if (skills.Perception != null) derived.passive_perception = 10 + skills.Perception;
  if (record.spellcasting_ability && pb != null) {
    const key = record.spellcasting_ability.toLowerCase();
    const m = abilityMod(record[key]);
    if (m != null) {
      derived.spell_save_dc = 8 + pb + m;
      derived.spell_attack_bonus = pb + m;
    }
  }
  return derived;
}
function decorateCharacter(record) {
  if (!record) return record;
  return { ...record, derived: computeDerived(record, { includeLevel: true }) };
}
function decorateNpc(record) {
  if (!record) return record;
  return { ...record, derived: computeDerived(record, { includeLevel: false }) };
}

// src/functions/get_character.js
async function get_character(params, userSettings2) {
  await ensureMigrations(userSettings2);
  const { game, character } = params;
  const store = new SupabaseStore(userSettings2.externalDbUrl, userSettings2.externalDbKey);
  const record = await store.get("characters", character, game);
  if (!record || record.game_slug !== game) {
    return `No character found with identifier "${character}" in game "${game}".`;
  }
  return JSON.stringify(decorateCharacter(record));
}

// src/functions/get_npc.js
async function get_npc(params, userSettings2) {
  await ensureMigrations(userSettings2);
  const { game, npc } = params;
  const store = new SupabaseStore(userSettings2.externalDbUrl, userSettings2.externalDbKey);
  const record = await store.get("npcs", npc, game);
  if (!record || record.game_slug !== game) {
    return `No NPC found with identifier "${npc}" in game "${game}".`;
  }
  return JSON.stringify(decorateNpc(record));
}

// src/functions/give_item.js
var MAX_RETRIES6 = 5;
function escapeRegExp(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
function findStackedItem(equipment, itemName) {
  const pattern = new RegExp(`^${escapeRegExp(itemName)} \\(x(\\d+)\\)$`);
  for (let i = 0; i < equipment.length; i++) {
    if (equipment[i] === itemName) return { idx: i, quantity: 1 };
    const m = equipment[i].match(pattern);
    if (m) return { idx: i, quantity: parseInt(m[1], 10) };
  }
  return null;
}
async function give_item(params, userSettings2) {
  await ensureMigrations(userSettings2);
  const { game, entity_type, entity, item, quantity = 1 } = params;
  const table = entity_type === "character" ? "characters" : "npcs";
  const store = new SupabaseStore(userSettings2.externalDbUrl, userSettings2.externalDbKey);
  for (let attempt = 0; attempt < MAX_RETRIES6; attempt++) {
    const record = await store.get(table, entity, game);
    if (!record || record.game_slug !== game) {
      return `No ${entity_type} found with identifier "${entity}" in game "${game}".`;
    }
    const equipment = [...record.equipment ?? []];
    const existing = findStackedItem(equipment, item);
    let resultEntry;
    if (existing) {
      const newQty = existing.quantity + quantity;
      resultEntry = newQty === 1 ? item : `${item} (x${newQty})`;
      equipment[existing.idx] = resultEntry;
    } else {
      resultEntry = quantity === 1 ? item : `${item} (x${quantity})`;
      equipment.push(resultEntry);
    }
    const updated = await store.patch(table, record.id, { equipment }, record.updated_at);
    if (updated === null) continue;
    const action = existing ? `updated to "${resultEntry}"` : `"${resultEntry}" added`;
    return `${action} in ${record.name}'s equipment. Equipment: ${equipment.join(", ")}.`;
  }
  return `Could not update equipment for "${entity}" after ${MAX_RETRIES6} attempts due to concurrent updates. Please retry.`;
}

// src/functions/grant_xp.js
var MAX_RETRIES7 = 5;
async function grant_xp(params, userSettings2) {
  await ensureMigrations(userSettings2);
  const { game, amount, characters: targets } = params;
  const store = new SupabaseStore(userSettings2.externalDbUrl, userSettings2.externalDbKey);
  const gameRecord = await store.get("games", game);
  if (!gameRecord) {
    return `No game found with slug "${game}".`;
  }
  let records;
  if (!targets || targets.length === 0) {
    records = await store.list("characters", { game_slug: game });
    if (!records || records.length === 0) {
      return `No characters found in game "${game}".`;
    }
  } else {
    const fetched = await Promise.all(targets.map((t) => store.get("characters", t, game)));
    const missing = targets.filter((_, i) => !fetched[i] || fetched[i].game_slug !== game);
    if (missing.length > 0) {
      return `Characters not found in game "${game}": ${missing.join(", ")}.`;
    }
    records = fetched;
  }
  const results = [];
  for (const record of records) {
    let patched = null;
    for (let attempt = 0; attempt < MAX_RETRIES7; attempt++) {
      const fresh = attempt === 0 ? record : await store.get("characters", record.id, game);
      const newXp = (fresh.xp ?? 0) + amount;
      patched = await store.patch("characters", fresh.id, { xp: newXp }, fresh.updated_at);
      if (patched !== null) {
        results.push(`${fresh.name}: ${fresh.xp ?? 0} \u2192 ${newXp} XP`);
        break;
      }
    }
    if (patched === null) {
      results.push(`${record.name}: failed to update after ${MAX_RETRIES7} attempts`);
    }
  }
  return `Granted ${amount} XP.
${results.join("\n")}`;
}

// src/functions/list_characters.js
async function list_characters(params, userSettings2) {
  await ensureMigrations(userSettings2);
  const { game, fields } = params;
  const store = new SupabaseStore(userSettings2.externalDbUrl, userSettings2.externalDbKey);
  const gameRecord = await store.get("games", game);
  if (!gameRecord) {
    return `No game found with slug "${game}".`;
  }
  const characters = await store.list("characters", { game_slug: game });
  if (characters.length === 0) {
    return `No characters found in game "${game}".`;
  }
  const decorated = characters.map(decorateCharacter);
  const keys = fields ?? ["slug", "name", "current_hp", "max_hp", "temporary_hp", "ac", "conditions"];
  return JSON.stringify(decorated.map((c) => Object.fromEntries(keys.map((k) => [k, c[k]]))));
}

// src/functions/list_effects.js
async function list_effects(params, userSettings2) {
  await ensureMigrations(userSettings2);
  const { game, entity_type, entity } = params;
  const store = new SupabaseStore(userSettings2.externalDbUrl, userSettings2.externalDbKey);
  const filters = { game_slug: game };
  if (entity_type) filters.target_type = entity_type;
  if (entity) filters.target = entity;
  const effects = await store.list("active_effects", filters, { order: "created_at" });
  if (effects.length === 0) {
    const scope = entity ? `on "${entity}"` : `in game "${game}"`;
    return `No active effects ${scope}.`;
  }
  const lines = [`Active effects in "${game}":`];
  for (const e of effects) {
    let durStr;
    if (e.duration_rounds === -1) {
      durStr = "indefinite";
    } else if (e.expires_at_round != null) {
      durStr = `${e.duration_rounds}r (expires after round ${e.expires_at_round})`;
    } else {
      durStr = `${e.duration_rounds}r (timer starts when combat begins)`;
    }
    const concStr = e.concentration ? e.concentration_owner ? ` [conc: ${e.concentration_owner}]` : " [conc]" : "";
    const sourceStr = e.source ? ` from ${e.source}` : "";
    lines.push(`  [${e.id.slice(0, 8)}] ${e.target} (${e.target_type}) <- ${e.name}${sourceStr}${concStr}: ${durStr}`);
    for (const m of e.modifiers ?? []) {
      const dice = m.dice ? ` ${m.dice}` : "";
      const val = m.value != null ? ` ${m.value}` : "";
      const dt = m.damage_type ? ` [${m.damage_type}]` : "";
      const ab = m.ability ? ` (${m.ability} only)` : "";
      lines.push(`    * ${m.type}${dice}${val}${dt}${ab} -> [${(m.roll_types ?? []).join(", ")}]`);
    }
  }
  return lines.join("\n");
}

// src/functions/list_games.js
async function list_games(params, userSettings2) {
  await ensureMigrations(userSettings2);
  const store = new SupabaseStore(userSettings2.externalDbUrl, userSettings2.externalDbKey);
  const games = await store.list("games");
  if (games.length === 0) {
    return "No games found.";
  }
  return JSON.stringify(games.map((g) => ({ slug: g.slug, name: g.name, description: g.description })));
}

// src/functions/list_log.js
async function list_log(params, userSettings2) {
  await ensureMigrations(userSettings2);
  const { game, category, limit = 50 } = params;
  const store = new SupabaseStore(userSettings2.externalDbUrl, userSettings2.externalDbKey);
  const gameRecord = await store.get("games", game);
  if (!gameRecord) {
    return `No game found with slug "${game}".`;
  }
  const filters = { game_slug: game };
  if (category) filters.category = category;
  const entries = await store.list("session_logs", filters, {
    order: "created_at.asc",
    limit
  });
  if (entries.length === 0) {
    const catStr = category ? ` with category "${category}"` : "";
    return `No log entries${catStr} found for game "${gameRecord.name}".`;
  }
  const lines = entries.map((e) => {
    const timeStr = e.world_time ? `[Day ${e.world_time.day}, ${String(e.world_time.hour).padStart(2, "0")}:${String(e.world_time.minute).padStart(2, "0")}]` : `[${e.created_at.slice(0, 16).replace("T", " ")}]`;
    const catStr = e.category ? ` [${e.category}]` : "";
    return `${timeStr}${catStr} ${e.entry}`;
  });
  const catFilter = category ? ` (category: ${category})` : "";
  const limitNote = entries.length === limit ? ` \u2014 showing last ${limit}` : "";
  return `Session log for "${gameRecord.name}"${catFilter}${limitNote}:

${lines.join("\n")}`;
}

// src/functions/list_memories.js
async function list_memories(params, userSettings2) {
  await ensureMigrations(userSettings2);
  const { game, tag } = params;
  const store = new SupabaseStore(userSettings2.externalDbUrl, userSettings2.externalDbKey);
  const gameRecord = await store.get("games", game);
  if (!gameRecord) {
    return `No game found with slug "${game}".`;
  }
  const memories = await store.list("game_memories", { game_slug: game });
  if (memories.length === 0) {
    return `No memories found for game "${game}".`;
  }
  const filtered = tag ? memories.filter((m) => (m.tags ?? []).includes(tag)) : memories;
  if (filtered.length === 0) {
    return `No memories with tag "${tag}" found in game "${game}".`;
  }
  return JSON.stringify(filtered.map((m) => ({
    slug: m.slug,
    name: m.name,
    memory: m.memory,
    tags: m.tags ?? []
  })));
}

// src/functions/list_npcs.js
async function list_npcs(params, userSettings2) {
  await ensureMigrations(userSettings2);
  const { game, fields } = params;
  const store = new SupabaseStore(userSettings2.externalDbUrl, userSettings2.externalDbKey);
  const gameRecord = await store.get("games", game);
  if (!gameRecord) {
    return `No game found with slug "${game}".`;
  }
  const npcs = await store.list("npcs", { game_slug: game });
  if (npcs.length === 0) {
    return `No NPCs found in game "${game}".`;
  }
  const decorated = npcs.map(decorateNpc);
  const keys = fields ?? ["slug", "name", "cr", "ac", "current_hp", "max_hp", "temporary_hp", "conditions"];
  return JSON.stringify(decorated.map((n) => Object.fromEntries(keys.map((k) => [k, n[k]]))));
}

// src/functions/log_event.js
async function log_event(params, userSettings2) {
  await ensureMigrations(userSettings2);
  const { game, entry, category } = params;
  const store = new SupabaseStore(userSettings2.externalDbUrl, userSettings2.externalDbKey);
  const gameRecord = await store.get("games", game);
  if (!gameRecord) {
    return `No game found with slug "${game}".`;
  }
  await store.insert("session_logs", {
    id: crypto.randomUUID(),
    game_slug: game,
    entry,
    category: category ?? null,
    world_time: gameRecord.world_time ?? null
  });
  const catStr = category ? ` [${category}]` : "";
  const timeStr = gameRecord.world_time ? ` (${formatTime2(gameRecord.world_time)})` : "";
  return `Logged${catStr}${timeStr}: ${entry}`;
}
function formatTime2(t) {
  return `Day ${t.day}, ${String(t.hour).padStart(2, "0")}:${String(t.minute).padStart(2, "0")}`;
}

// src/functions/remove_condition.js
var MAX_RETRIES8 = 5;
async function remove_condition(params, userSettings2) {
  await ensureMigrations(userSettings2);
  const { game, entity_type, entity, condition } = params;
  const table = entity_type === "character" ? "characters" : "npcs";
  const store = new SupabaseStore(userSettings2.externalDbUrl, userSettings2.externalDbKey);
  const gameRecord = await store.get("games", game);
  if (!gameRecord) {
    return `No game found with slug "${game}".`;
  }
  for (let attempt = 0; attempt < MAX_RETRIES8; attempt++) {
    const record = await store.get(table, entity, game);
    if (!record || record.game_slug !== game) {
      return `No ${entity_type} found with identifier "${entity}" in game "${game}".`;
    }
    const current = record.conditions ?? [];
    if (!current.includes(condition)) {
      return `${record.name} does not have the ${condition} condition.`;
    }
    const remaining = current.filter((c) => c !== condition);
    const updated = await store.patch(table, record.id, { conditions: remaining }, record.updated_at);
    if (updated === null) continue;
    if (remaining.length === 0) {
      return `${record.name} is no longer ${condition}. No active conditions.`;
    }
    return `${record.name} is no longer ${condition}. Active conditions: ${remaining.join(", ")}.`;
  }
  return `Could not remove condition from "${entity}" after ${MAX_RETRIES8} attempts due to concurrent updates. Please retry.`;
}

// src/functions/remove_effect.js
async function remove_effect(params, userSettings2) {
  await ensureMigrations(userSettings2);
  const { game, effect_id, name, target_type, target } = params;
  const store = new SupabaseStore(userSettings2.externalDbUrl, userSettings2.externalDbKey);
  if (effect_id) {
    const effects2 = await store.list("active_effects", { game_slug: game });
    const found = effects2.find((e) => e.id === effect_id || e.id.startsWith(effect_id));
    if (!found) {
      return `No effect with ID "${effect_id}" found in game "${game}".`;
    }
    await store.delete("active_effects", found.id);
    return `Removed "${found.name}" (${found.id.slice(0, 8)}) from "${found.target}".`;
  }
  if (!name) {
    return "Provide either effect_id or name (and optionally target) to identify the effect.";
  }
  const filters = { game_slug: game, name };
  if (target_type) filters.target_type = target_type;
  if (target) filters.target = target;
  const effects = await store.list("active_effects", filters);
  if (effects.length === 0) {
    const scope = target ? `on "${target}"` : `in game "${game}"`;
    return `No active effect named "${name}" found ${scope}.`;
  }
  for (const e of effects) {
    await store.delete("active_effects", e.id);
  }
  const who = target ? `"${target}"` : "all targets";
  return `Removed ${effects.length} instance(s) of "${name}" from ${who}.`;
}

// src/functions/remove_item.js
var MAX_RETRIES9 = 5;
function escapeRegExp2(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
function findStackedItem2(equipment, itemName) {
  const pattern = new RegExp(`^${escapeRegExp2(itemName)} \\(x(\\d+)\\)$`);
  for (let i = 0; i < equipment.length; i++) {
    if (equipment[i] === itemName) return { idx: i, quantity: 1 };
    const m = equipment[i].match(pattern);
    if (m) return { idx: i, quantity: parseInt(m[1], 10) };
  }
  return null;
}
async function remove_item(params, userSettings2) {
  await ensureMigrations(userSettings2);
  const { game, entity_type, entity, item, quantity = 1 } = params;
  const table = entity_type === "character" ? "characters" : "npcs";
  const store = new SupabaseStore(userSettings2.externalDbUrl, userSettings2.externalDbKey);
  for (let attempt = 0; attempt < MAX_RETRIES9; attempt++) {
    const record = await store.get(table, entity, game);
    if (!record || record.game_slug !== game) {
      return `No ${entity_type} found with identifier "${entity}" in game "${game}".`;
    }
    const existing = findStackedItem2(record.equipment ?? [], item);
    if (!existing) {
      return `"${item}" is not in ${record.name}'s equipment.`;
    }
    const equipment = [...record.equipment];
    const newQty = existing.quantity - quantity;
    if (newQty <= 0) {
      equipment.splice(existing.idx, 1);
    } else if (newQty === 1) {
      equipment[existing.idx] = item;
    } else {
      equipment[existing.idx] = `${item} (x${newQty})`;
    }
    const updated = await store.patch(table, record.id, { equipment }, record.updated_at);
    if (updated === null) continue;
    const removedNote = newQty <= 0 ? `"${item}" removed` : `"${item}" updated to ${newQty === 1 ? `"${item}"` : `"${item} (x${newQty})"`}`;
    const equipStr = equipment.length > 0 ? equipment.join(", ") : "none";
    return `${removedNote} from ${record.name}'s equipment. Equipment: ${equipStr}.`;
  }
  return `Could not update equipment for "${entity}" after ${MAX_RETRIES9} attempts due to concurrent updates. Please retry.`;
}

// src/functions/rest.js
var DICE_PATTERN = /^\d+d\d+/i;
function getRules(r) {
  if (Array.isArray(r.recovery_rules)) return r.recovery_rules;
  if (r.recovery_frequency) return [{ amount: r.recovery_amount ?? "full", frequency: r.recovery_frequency }];
  return [];
}
function resolveAmount(amount, max) {
  if (amount === "full") return max;
  if (DICE_PATTERN.test(String(amount))) {
    try {
      return new DiceParser().parse(String(amount)).total;
    } catch {
      return 0;
    }
  }
  return parseInt(amount, 10) || 0;
}
function recoverResources(resources2, frequencies) {
  const recovered = [];
  const updated = resources2.map((r) => {
    const rules = getRules(r);
    const matching = rules.filter((rule) => frequencies.includes(rule.frequency));
    if (matching.length === 0 || r.current >= r.max) return r;
    const best = matching.reduce((best2, rule) => {
      const val = resolveAmount(rule.amount, r.max);
      return val > best2.val ? { val, isDice: DICE_PATTERN.test(String(rule.amount)), expr: rule.amount } : best2;
    }, { val: -Infinity, isDice: false, expr: "" });
    if (best.val <= 0) return r;
    const newCurrent = Math.min(r.max, r.current + best.val);
    if (newCurrent !== r.current) {
      const note = best.isDice ? ` (rolled ${best.expr})` : "";
      recovered.push({ name: r.name, gained: newCurrent - r.current, newCurrent, max: r.max, note });
    }
    return { ...r, current: newCurrent };
  });
  return { updated, recovered };
}
async function rest(params, userSettings2) {
  await ensureMigrations(userSettings2);
  const { game, rest_type } = params;
  const store = new SupabaseStore(userSettings2.externalDbUrl, userSettings2.externalDbKey);
  const gameRecord = await store.get("games", game);
  if (!gameRecord) {
    return `No game found with slug "${game}".`;
  }
  const characters = await store.list("characters", { game_slug: game });
  if (characters.length === 0) {
    return `No characters found in game "${game}".`;
  }
  const results = [];
  if (rest_type === "long") {
    for (const c of characters) {
      const { updated: updatedResources, recovered } = recoverResources(
        c.resources ?? [],
        ["short_rest", "long_rest"]
      );
      await store.patch("characters", c.id, {
        current_hp: c.max_hp,
        temporary_hp: 0,
        spell_slots_usable: c.spell_slots_total ?? {},
        conditions: [],
        death_save_successes: 0,
        death_save_failures: 0,
        resources: updatedResources
      });
      const parts = [`${c.name}: HP restored to ${c.max_hp}`];
      const totalSlots = Object.values(c.spell_slots_total ?? {}).reduce((a, b) => a + b, 0);
      if (totalSlots > 0) parts.push(`all spell slots restored`);
      if (c.temporary_hp > 0) parts.push(`${c.temporary_hp} temp HP cleared`);
      const activeConditions = c.conditions ?? [];
      if (activeConditions.length > 0) parts.push(`conditions cleared (${activeConditions.join(", ")})`);
      if (recovered.length > 0) parts.push(`resources restored: ${recovered.map((r) => `${r.name} ${r.newCurrent}/${r.max}${r.note}`).join(", ")}`);
      results.push(parts.join(", ") + ".");
    }
    return `Long rest complete.
${results.join("\n")}`;
  }
  for (const c of characters) {
    const parts = [];
    const isWarlock = c.class_name?.toLowerCase().includes("warlock");
    const patch = {};
    if (isWarlock) {
      const totalSlots = Object.values(c.spell_slots_total ?? {}).reduce((a, b) => a + b, 0);
      patch.spell_slots_usable = c.spell_slots_total ?? {};
      parts.push(`Pact Magic restored (${totalSlots} slot${totalSlots !== 1 ? "s" : ""})`);
    }
    const { updated: updatedResources, recovered } = recoverResources(
      c.resources ?? [],
      ["short_rest"]
    );
    if (recovered.length > 0) patch.resources = updatedResources;
    if (recovered.length > 0) parts.push(`resources restored: ${recovered.map((r) => `${r.name} ${r.newCurrent}/${r.max}${r.note}`).join(", ")}`);
    if (Object.keys(patch).length > 0) await store.patch("characters", c.id, patch);
    if (parts.length === 0) parts.push("no automated changes (spend Hit Dice to recover HP)");
    results.push(`${c.name}: ${parts.join(", ")}.`);
  }
  return `Short rest complete.
${results.join("\n")}`;
}

// src/functions/roll_death_save.js
var MAX_RETRIES10 = 5;
async function roll_death_save(params, userSettings2) {
  await ensureMigrations(userSettings2);
  const { game, character, outcome } = params;
  const store = new SupabaseStore(userSettings2.externalDbUrl, userSettings2.externalDbKey);
  const gameRecord = await store.get("games", game);
  if (!gameRecord) {
    return `No game found with slug "${game}".`;
  }
  for (let attempt = 0; attempt < MAX_RETRIES10; attempt++) {
    const record = await store.get("characters", character, game);
    if (!record || record.game_slug !== game) {
      return `No character found with identifier "${character}" in game "${game}".`;
    }
    if (record.current_hp > 0) {
      return `${record.name} is not at 0 HP and does not need to make death saving throws.`;
    }
    if (outcome === "critical_success") {
      const updated2 = await store.patch("characters", record.id, {
        current_hp: 1,
        death_save_successes: 0,
        death_save_failures: 0
      }, record.updated_at);
      if (updated2 === null) continue;
      return `${record.name} rolls a natural 20! They regain 1 HP and regain consciousness. Death saves cleared.`;
    }
    const failures = (record.death_save_failures ?? 0) + (outcome === "critical_failure" ? 2 : outcome === "failure" ? 1 : 0);
    const successes = (record.death_save_successes ?? 0) + (outcome === "success" ? 1 : 0);
    if (failures >= 3) {
      const updated2 = await store.patch("characters", record.id, {
        death_save_successes: 0,
        death_save_failures: 0
      }, record.updated_at);
      if (updated2 === null) continue;
      const failCount = outcome === "critical_failure" ? "two failures (natural 1)" : "a failure";
      return `${record.name} suffers ${failCount}. That's ${Math.min(failures, 3)} failures total \u2014 ${record.name} has died.`;
    }
    if (successes >= 3) {
      const updated2 = await store.patch("characters", record.id, {
        death_save_successes: 0,
        death_save_failures: 0
      }, record.updated_at);
      if (updated2 === null) continue;
      return `${record.name} succeeds on their third death save and stabilizes. They remain unconscious at 0 HP. Death saves cleared.`;
    }
    const updated = await store.patch("characters", record.id, {
      death_save_successes: successes,
      death_save_failures: Math.min(failures, 3)
    }, record.updated_at);
    if (updated === null) continue;
    const outcomeDesc = outcome === "critical_failure" ? "natural 1 \u2014 two failures" : outcome === "failure" ? "failure" : "success";
    return `${record.name}: death save ${outcomeDesc}. Successes: ${successes}/3, Failures: ${Math.min(failures, 3)}/3.`;
  }
  return `Could not record death save for "${character}" after ${MAX_RETRIES10} attempts due to concurrent updates. Please retry.`;
}

// src/functions/roll_dice.js
async function roll_dice(params, _userSettings) {
  const { expression, mode = "system", description } = params;
  const parser = new DiceParser();
  const exprs = splitExpressions(expression);
  const multi = exprs.length > 1;
  if (mode === "system") {
    const lines = [];
    for (const expr of exprs) {
      try {
        const result = parser.parse(expr);
        lines.push(multi ? `${result.expression}: ${result.total}` : String(result.total));
      } catch (err) {
        lines.push(`${expr}: Error: ${err.message}`);
      }
    }
    const header2 = description ? multi ? `${description}
` : `${description}: ` : "";
    return `${header2}${lines.join("\n")}`;
  }
  if (mode === "transparent") {
    const blocks2 = [];
    for (const expr of exprs) {
      try {
        blocks2.push(formatTransparent(parser.parse(expr)));
      } catch (err) {
        blocks2.push(`${expr}: Error: ${err.message}`);
      }
    }
    const header2 = description ? `${description}
` : "";
    return `${header2}${blocks2.join("\n\n")}`;
  }
  const exprInfos = exprs.map((expr) => ({ expr, groups: parser.listGroups(expr) }));
  const allValues = [];
  let elicitAvailable = true;
  outer: for (const { groups } of exprInfos) {
    for (const groupExpr of groups) {
      const promptMsg = description ? `${description}
Roll ${groupExpr} and enter your total:` : `Roll ${groupExpr} and enter your total:`;
      const { value: input, available } = await elicit(promptMsg);
      if (!available) {
        elicitAvailable = false;
        break outer;
      }
      if (input === null) return "Roll cancelled.";
      const val = parseInt(input, 10);
      allValues.push(isNaN(val) ? 1 : val);
    }
  }
  if (!elicitAvailable) {
    const blocks2 = [];
    for (const expr of exprs) {
      try {
        blocks2.push(formatTransparent(parser.parse(expr)));
      } catch (err) {
        blocks2.push(`${expr}: Error: ${err.message}`);
      }
    }
    const header2 = description ? `${description}
` : "";
    return `${header2}${blocks2.join("\n\n")}
(Auto-rolled: user input not available on this platform.)`;
  }
  const blocks = [];
  let valueOffset = 0;
  for (const { expr, groups } of exprInfos) {
    const exprValues = allValues.slice(valueOffset, valueOffset + groups.length);
    valueOffset += groups.length;
    let idx = 0;
    try {
      const result = parser.parse(expr, void 0, (_e) => exprValues[idx++] ?? 1);
      const prefix = !multi && description ? `${description}
` : "";
      blocks.push(`${prefix}${formatTransparent(result)}`);
    } catch (err) {
      blocks.push(`Error: ${err.message}`);
    }
  }
  const header = description && multi ? `${description}
` : "";
  return `${header}${blocks.join("\n\n")}`;
}

// src/functions/roll_saves.js
async function roll_saves(params, userSettings2) {
  await ensureMigrations(userSettings2);
  const { game, dc, ability, entities } = params;
  const store = new SupabaseStore(userSettings2.externalDbUrl, userSettings2.externalDbKey);
  const parser = new DiceParser();
  const gameRecord = await store.get("games", game);
  if (!gameRecord) {
    return `No game found with slug "${game}".`;
  }
  const lines = [`${ability} saving throws (DC ${dc}):`];
  for (const ent of entities) {
    const table = ent.entity_type === "character" ? "characters" : "npcs";
    const record = await store.get(table, ent.entity, game);
    if (!record || record.game_slug !== game) {
      lines.push(`  ${ent.entity}: not found`);
      continue;
    }
    const { bonus, isProficient } = saveBonus(record, ability);
    const signed = signedBonus(bonus);
    const roll = parser.parse(`1d20${signed}`);
    const d20Result = roll.total - bonus;
    const passed = roll.total >= dc;
    const profNote = isProficient ? " (prof)" : "";
    const outcome = passed ? "PASS" : "FAIL";
    lines.push(`  ${record.name} (${ent.entity_type}): d20=${d20Result}${signed}${profNote} = ${roll.total} \u2014 ${outcome}`);
  }
  return lines.join("\n");
}

// src/functions/set_concentration.js
var MAX_RETRIES11 = 5;
async function set_concentration(params, userSettings2) {
  await ensureMigrations(userSettings2);
  const { game, entity_type, entity, spell } = params;
  const table = entity_type === "character" ? "characters" : "npcs";
  const store = new SupabaseStore(userSettings2.externalDbUrl, userSettings2.externalDbKey);
  const gameRecord = await store.get("games", game);
  if (!gameRecord) {
    return `No game found with slug "${game}".`;
  }
  for (let attempt = 0; attempt < MAX_RETRIES11; attempt++) {
    const record = await store.get(table, entity, game);
    if (!record || record.game_slug !== game) {
      return `No ${entity_type} found with identifier "${entity}" in game "${game}".`;
    }
    const concentration = {
      spell,
      started_round: gameRecord.combat_round ?? 0
    };
    const previous = record.concentration;
    const updated = await store.patch(table, record.id, { concentration }, record.updated_at);
    if (updated === null) continue;
    const prevNote = previous ? ` (broke concentration on ${previous.spell})` : "";
    return `${record.name} is now concentrating on ${spell}${prevNote}.`;
  }
  return `Could not set concentration for "${entity}" after ${MAX_RETRIES11} attempts due to concurrent updates. Please retry.`;
}

// src/functions/set_hp.js
var MAX_RETRIES12 = 5;
async function set_hp(params, userSettings2) {
  await ensureMigrations(userSettings2);
  const { game, entity_type, entity, current_hp, max_hp } = params;
  if (current_hp == null && max_hp == null) {
    return "Provide at least one of current_hp or max_hp.";
  }
  const table = entity_type === "character" ? "characters" : "npcs";
  const store = new SupabaseStore(userSettings2.externalDbUrl, userSettings2.externalDbKey);
  for (let attempt = 0; attempt < MAX_RETRIES12; attempt++) {
    const record = await store.get(table, entity, game);
    if (!record || record.game_slug !== game) {
      return `No ${entity_type} found with identifier "${entity}" in game "${game}".`;
    }
    const effectiveMax = max_hp ?? record.max_hp;
    const effectiveCurrent = current_hp != null ? Math.max(0, Math.min(current_hp, effectiveMax)) : record.current_hp;
    const patch = {};
    if (max_hp != null) patch.max_hp = effectiveMax;
    if (current_hp != null) patch.current_hp = effectiveCurrent;
    if (entity_type === "character" && record.current_hp === 0 && effectiveCurrent > 0) {
      patch.death_save_successes = 0;
      patch.death_save_failures = 0;
    }
    const updated = await store.patch(table, record.id, patch, record.updated_at);
    if (updated === null) continue;
    const parts = [];
    if (max_hp != null) parts.push(`max HP \u2192 ${effectiveMax}`);
    if (current_hp != null) parts.push(`current HP \u2192 ${effectiveCurrent}`);
    const deathNote = patch.death_save_successes !== void 0 ? " Death saves cleared." : "";
    return `${record.name}: ${parts.join(", ")}. HP: ${effectiveCurrent}/${effectiveMax}.${deathNote}`;
  }
  return `Could not set HP for "${entity}" after ${MAX_RETRIES12} attempts due to concurrent updates. Please retry.`;
}

// src/functions/set_world_time.js
async function set_world_time(params, userSettings2) {
  await ensureMigrations(userSettings2);
  const { game, day, hour = 0, minute = 0, note } = params;
  const store = new SupabaseStore(userSettings2.externalDbUrl, userSettings2.externalDbKey);
  const gameRecord = await store.get("games", game);
  if (!gameRecord) {
    return `No game found with slug "${game}".`;
  }
  const world_time = { day, hour, minute, note: note ?? null };
  await store.patch("games", gameRecord.id, { world_time });
  const timeStr = formatTime3(world_time);
  const noteStr = note ? ` \u2014 ${note}` : "";
  return `World time set to ${timeStr}${noteStr}.`;
}
function formatTime3(t) {
  return `Day ${t.day}, ${String(t.hour).padStart(2, "0")}:${String(t.minute).padStart(2, "0")}`;
}

// src/functions/stabilize_character.js
var MAX_RETRIES13 = 5;
async function stabilize_character(params, userSettings2) {
  await ensureMigrations(userSettings2);
  const { game, character } = params;
  const store = new SupabaseStore(userSettings2.externalDbUrl, userSettings2.externalDbKey);
  const gameRecord = await store.get("games", game);
  if (!gameRecord) {
    return `No game found with slug "${game}".`;
  }
  for (let attempt = 0; attempt < MAX_RETRIES13; attempt++) {
    const record = await store.get("characters", character, game);
    if (!record || record.game_slug !== game) {
      return `No character found with identifier "${character}" in game "${game}".`;
    }
    if (record.current_hp > 0) {
      return `${record.name} is at ${record.current_hp} HP and does not need stabilizing.`;
    }
    if (record.death_save_successes === 0 && record.death_save_failures === 0) {
      return `${record.name} is already stable at 0 HP.`;
    }
    const updated = await store.patch("characters", record.id, {
      death_save_successes: 0,
      death_save_failures: 0
    }, record.updated_at);
    if (updated === null) continue;
    return `${record.name} is stabilized. They remain unconscious at 0 HP but no longer need to make death saving throws.`;
  }
  return `Could not stabilize "${character}" after ${MAX_RETRIES13} attempts due to concurrent updates. Please retry.`;
}

// src/functions/start_combat.js
async function start_combat(params, userSettings2) {
  await ensureMigrations(userSettings2);
  const { game, combatants } = params;
  const store = new SupabaseStore(userSettings2.externalDbUrl, userSettings2.externalDbKey);
  const gameRecord = await store.get("games", game);
  if (!gameRecord) {
    return `No game found with slug "${game}".`;
  }
  if (gameRecord.combat_active) {
    return `Combat is already active in "${game}" (round ${gameRecord.combat_round}). Call end_combat first to reset.`;
  }
  const parser = new DiceParser();
  const initLines = [];
  const resolved = [];
  for (const combatant of combatants) {
    if (combatant.initiative != null) {
      resolved.push({ ...combatant, reaction_available: true });
      continue;
    }
    const entityTable = combatant.entity_type === "character" ? "characters" : "npcs";
    const entityRecord = await store.get(entityTable, combatant.slug, game);
    const dex = entityRecord?.dexterity ?? 10;
    const dexMod = Math.floor((dex - 10) / 2);
    const sign = dexMod >= 0 ? `+${dexMod}` : `${dexMod}`;
    const roll = parser.parse(`1d20${sign}`);
    const d20Result = roll.total - dexMod;
    initLines.push(`  ${combatant.name}: 1d20(${d20Result})${sign} = ${roll.total}`);
    resolved.push({ ...combatant, initiative: roll.total, reaction_available: true });
  }
  const sorted = [...resolved].sort((a, b) => b.initiative - a.initiative);
  const storageOrder = sorted.map(({ ...c }) => c);
  await store.patch("games", gameRecord.id, {
    combat_active: true,
    combat_round: 1,
    turn_order: storageOrder,
    active_combatant_index: 0
  });
  const orderLines = sorted.map((c, i) => `  ${i + 1}. ${c.name} (${c.entity_type}) \u2014 initiative ${c.initiative}`).join("\n");
  const first = sorted[0];
  const autoRollNote = initLines.length > 0 ? `
Auto-rolled initiatives:
${initLines.join("\n")}
` : "\n";
  return `Combat begins! Round 1.${autoRollNote}
Initiative order:
${orderLines}

First up: ${first.name} (${first.entity_type}).`;
}

// src/functions/transfer_item.js
var MAX_RETRIES14 = 5;
async function transfer_item(params, userSettings2) {
  await ensureMigrations(userSettings2);
  const { game, from_entity_type, from_entity, to_entity_type, to_entity, item } = params;
  const store = new SupabaseStore(userSettings2.externalDbUrl, userSettings2.externalDbKey);
  const fromTable = from_entity_type === "character" ? "characters" : "npcs";
  const toTable = to_entity_type === "character" ? "characters" : "npcs";
  let fromRecord;
  for (let attempt = 0; attempt < MAX_RETRIES14; attempt++) {
    const record = await store.get(fromTable, from_entity, game);
    if (!record || record.game_slug !== game) {
      return `No ${from_entity_type} found with identifier "${from_entity}" in game "${game}".`;
    }
    const idx = (record.equipment ?? []).indexOf(item);
    if (idx === -1) {
      return `"${item}" is not in ${record.name}'s equipment.`;
    }
    const equipment = [...record.equipment];
    equipment.splice(idx, 1);
    const updated = await store.patch(fromTable, record.id, { equipment }, record.updated_at);
    if (updated === null) continue;
    fromRecord = record;
    break;
  }
  if (!fromRecord) {
    return `Could not remove "${item}" from "${from_entity}" after ${MAX_RETRIES14} attempts. Please retry.`;
  }
  for (let attempt = 0; attempt < MAX_RETRIES14; attempt++) {
    const record = await store.get(toTable, to_entity, game);
    if (!record || record.game_slug !== game) {
      return `Item removed from ${fromRecord.name} but destination "${to_entity}" not found \u2014 item may be lost. Add it manually.`;
    }
    const equipment = [...record.equipment ?? [], item];
    const updated = await store.patch(toTable, record.id, { equipment }, record.updated_at);
    if (updated === null) continue;
    return `"${item}" transferred from ${fromRecord.name} to ${record.name}.`;
  }
  return `Item removed from ${fromRecord.name} but could not add to "${to_entity}" after ${MAX_RETRIES14} attempts. Item may be lost \u2014 add it manually.`;
}

// src/functions/update_game.js
async function update_game(params, userSettings2) {
  await ensureMigrations(userSettings2);
  const { game, name, description } = params;
  const store = new SupabaseStore(userSettings2.externalDbUrl, userSettings2.externalDbKey);
  const record = await store.get("games", game);
  if (!record) {
    return `No game found with identifier "${game}".`;
  }
  const patch = {};
  if (name !== void 0) patch.name = name;
  if (description !== void 0) patch.description = description;
  if (Object.keys(patch).length === 0) {
    return "No fields to update.";
  }
  await store.patch("games", record.id, patch);
  return `Game "${record.name}" updated.`;
}

// src/functions/upsert_character.js
var IMMUTABLE = /* @__PURE__ */ new Set(["id", "game_slug", "slug", "created_at", "updated_at"]);
function toSlug(name) {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}
async function upsert_character(params, userSettings2) {
  await ensureMigrations(userSettings2);
  const { game, name, slug: explicitSlug, ...rest2 } = params;
  const slug = explicitSlug ?? toSlug(name);
  const store = new SupabaseStore(userSettings2.externalDbUrl, userSettings2.externalDbKey);
  const gameRecord = await store.get("games", game);
  if (!gameRecord) {
    return `No game found with slug "${game}". Create it first with dnd5e24_create_game, or check the slug.`;
  }
  const existing = await store.get("characters", slug, game);
  if (existing && existing.game_slug === game) {
    const patch = Object.fromEntries(
      Object.entries({ name, ...rest2 }).filter(([k, v]) => !IMMUTABLE.has(k) && v !== void 0)
    );
    if (Object.keys(patch).length === 0) {
      return `Character "${existing.name}" (slug: "${slug}") is already up to date.`;
    }
    await store.patch("characters", existing.id, patch);
    return `Character "${existing.name}" (slug: "${slug}") updated in game "${game}".`;
  }
  const {
    player,
    species,
    class_name,
    subclass,
    level,
    background,
    ac,
    max_hp,
    current_hp,
    temporary_hp,
    speeds,
    strength,
    dexterity,
    constitution,
    intelligence,
    wisdom,
    charisma,
    pb,
    proficiencies,
    expertise,
    weapon_mastery,
    spellcasting_ability,
    spells_known,
    spells_prepared,
    spell_slots_total,
    spell_slots_usable,
    senses,
    languages,
    damage_resistances,
    damage_immunities,
    damage_vulnerabilities,
    condition_immunities,
    conditions,
    features,
    equipment,
    notes,
    gold,
    xp,
    resources: resources2,
    death_save_successes,
    death_save_failures
  } = rest2;
  const character = {
    id: crypto.randomUUID(),
    game_slug: game,
    slug,
    name,
    player,
    species,
    class_name,
    subclass,
    level: level ?? 1,
    background,
    ac,
    max_hp,
    current_hp: current_hp ?? max_hp,
    temporary_hp: temporary_hp ?? 0,
    speeds,
    strength,
    dexterity,
    constitution,
    intelligence,
    wisdom,
    charisma,
    pb,
    proficiencies: proficiencies ?? [],
    expertise: expertise ?? [],
    weapon_mastery: weapon_mastery ?? [],
    spellcasting_ability,
    spells_known: spells_known ?? [],
    spells_prepared: spells_prepared ?? [],
    spell_slots_total: spell_slots_total ?? {},
    spell_slots_usable: spell_slots_usable ?? spell_slots_total ?? {},
    senses,
    languages: languages ?? [],
    damage_resistances: damage_resistances ?? [],
    damage_immunities: damage_immunities ?? [],
    damage_vulnerabilities: damage_vulnerabilities ?? [],
    condition_immunities: condition_immunities ?? [],
    conditions: conditions ?? [],
    features: features ?? [],
    equipment: equipment ?? [],
    notes,
    gold: gold ?? 0,
    xp: xp ?? 0,
    resources: resources2 ?? [],
    death_save_successes: death_save_successes ?? 0,
    death_save_failures: death_save_failures ?? 0
  };
  await store.insert("characters", character);
  return `Character "${name}" created with slug "${slug}" in game "${game}".`;
}

// src/functions/upsert_memory.js
async function upsert_memory(params, userSettings2) {
  await ensureMigrations(userSettings2);
  const { game, slug, name, memory, tags } = params;
  const store = new SupabaseStore(userSettings2.externalDbUrl, userSettings2.externalDbKey);
  const existing = await store.get("game_memories", slug, game);
  let row;
  if (existing) {
    const patch = { name, memory };
    if (tags !== void 0) patch.tags = tags;
    row = await store.patch("game_memories", existing.id, patch);
  } else {
    row = await store.insert("game_memories", {
      id: crypto.randomUUID(),
      game_slug: game,
      slug,
      name,
      memory,
      tags: tags ?? []
    });
  }
  const tagStr = row.tags?.length ? ` [tags: ${row.tags.join(", ")}]` : "";
  return `Memory "${row.name}" (${row.slug})${tagStr} saved for game "${game}".`;
}

// src/functions/upsert_npc.js
var IMMUTABLE2 = /* @__PURE__ */ new Set(["id", "game_slug", "slug", "created_at", "updated_at"]);
function toSlug2(name) {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}
async function upsert_npc(params, userSettings2) {
  await ensureMigrations(userSettings2);
  const { game, name, slug: explicitSlug, ...rest2 } = params;
  const slug = explicitSlug ?? toSlug2(name);
  const store = new SupabaseStore(userSettings2.externalDbUrl, userSettings2.externalDbKey);
  const gameRecord = await store.get("games", game);
  if (!gameRecord) {
    return `No game found with slug "${game}". Create it first with dnd5e24_create_game, or check the slug.`;
  }
  const existing = await store.get("npcs", slug, game);
  if (existing && existing.game_slug === game) {
    const patch = Object.fromEntries(
      Object.entries({ name, ...rest2 }).filter(([k, v]) => !IMMUTABLE2.has(k) && v !== void 0)
    );
    if (Object.keys(patch).length === 0) {
      return `NPC "${existing.name}" (slug: "${slug}") is already up to date.`;
    }
    await store.patch("npcs", existing.id, patch);
    return `NPC "${existing.name}" (slug: "${slug}") updated in game "${game}".`;
  }
  const {
    species,
    size,
    creature_type,
    alignment,
    ac,
    max_hp,
    current_hp,
    temporary_hp,
    speeds,
    strength,
    dexterity,
    constitution,
    intelligence,
    wisdom,
    charisma,
    pb,
    proficiencies,
    expertise,
    weapon_mastery,
    spellcasting_ability,
    spells_known,
    spells_prepared,
    spell_slots_total,
    spell_slots_usable,
    senses,
    languages,
    cr,
    damage_resistances,
    damage_immunities,
    damage_vulnerabilities,
    condition_immunities,
    conditions,
    traits,
    actions,
    bonus_actions,
    reactions,
    legendary_resistances,
    legendary_actions,
    lair_actions,
    equipment,
    notes,
    gold
  } = rest2;
  const npc = {
    id: crypto.randomUUID(),
    game_slug: game,
    slug,
    name,
    species,
    size,
    creature_type,
    alignment,
    ac,
    max_hp,
    current_hp: current_hp ?? max_hp,
    temporary_hp: temporary_hp ?? 0,
    speeds,
    strength,
    dexterity,
    constitution,
    intelligence,
    wisdom,
    charisma,
    pb,
    proficiencies: proficiencies ?? [],
    expertise: expertise ?? [],
    weapon_mastery: weapon_mastery ?? [],
    spellcasting_ability,
    spells_known: spells_known ?? [],
    spells_prepared: spells_prepared ?? [],
    spell_slots_total: spell_slots_total ?? {},
    spell_slots_usable: spell_slots_usable ?? spell_slots_total ?? {},
    senses,
    languages: languages ?? [],
    cr,
    damage_resistances: damage_resistances ?? [],
    damage_immunities: damage_immunities ?? [],
    damage_vulnerabilities: damage_vulnerabilities ?? [],
    condition_immunities: condition_immunities ?? [],
    conditions: conditions ?? [],
    traits: traits ?? [],
    actions: actions ?? [],
    bonus_actions: bonus_actions ?? [],
    reactions: reactions ?? [],
    legendary_resistances: legendary_resistances ?? 0,
    legendary_actions: legendary_actions ?? [],
    lair_actions: lair_actions ?? [],
    equipment: equipment ?? [],
    notes,
    gold: gold ?? 0
  };
  await store.insert("npcs", npc);
  return `NPC "${name}" created with slug "${slug}" in game "${game}".`;
}

// src/functions/use_reaction.js
async function use_reaction(params, userSettings2) {
  await ensureMigrations(userSettings2);
  const { game, entity_type, entity } = params;
  const store = new SupabaseStore(userSettings2.externalDbUrl, userSettings2.externalDbKey);
  const gameRecord = await store.get("games", game);
  if (!gameRecord) {
    return `No game found with slug "${game}".`;
  }
  if (!gameRecord.combat_active) {
    return `No active combat in "${game}". Reactions are tracked during combat only.`;
  }
  const turnOrder = gameRecord.turn_order ?? [];
  const idx = turnOrder.findIndex((c) => c.slug === entity && c.entity_type === entity_type);
  if (idx === -1) {
    return `"${entity}" (${entity_type}) is not in the current combat order.`;
  }
  const combatant = turnOrder[idx];
  if (combatant.reaction_available === false) {
    return `${combatant.name} has already used their reaction this round. It recharges at the start of their next turn.`;
  }
  const updatedTurnOrder = turnOrder.map(
    (c, i) => i === idx ? { ...c, reaction_available: false } : c
  );
  await store.patch("games", gameRecord.id, { turn_order: updatedTurnOrder });
  return `${combatant.name} uses their reaction. It will recharge at the start of their next turn (Round ${gameRecord.combat_round}).`;
}

// src/functions/use_resource.js
var MAX_RETRIES15 = 5;
async function use_resource(params, userSettings2) {
  await ensureMigrations(userSettings2);
  const { game, entity_type, entity, resource_name, amount = 1, action = "use" } = params;
  const table = entity_type === "character" ? "characters" : "npcs";
  const store = new SupabaseStore(userSettings2.externalDbUrl, userSettings2.externalDbKey);
  const gameRecord = await store.get("games", game);
  if (!gameRecord) {
    return `No game found with slug "${game}".`;
  }
  for (let attempt = 0; attempt < MAX_RETRIES15; attempt++) {
    const record = await store.get(table, entity, game);
    if (!record || record.game_slug !== game) {
      return `No ${entity_type} found with identifier "${entity}" in game "${game}".`;
    }
    const resources2 = record.resources ?? [];
    const idx = resources2.findIndex((r) => r.name === resource_name);
    if (idx === -1) {
      const available = resources2.map((r) => r.name).join(", ") || "none";
      return `${record.name} has no resource named "${resource_name}". Available: ${available}.`;
    }
    const resource = resources2[idx];
    if (action === "use") {
      if (resource.current < amount) {
        return `${record.name} only has ${resource.current}/${resource.max} ${resource_name} remaining \u2014 cannot spend ${amount}.`;
      }
      const newCurrent2 = resource.current - amount;
      const updated2 = resources2.map((r, i) => i === idx ? { ...r, current: newCurrent2 } : r);
      const result2 = await store.patch(table, record.id, { resources: updated2 }, record.updated_at);
      if (result2 === null) continue;
      return `${record.name} uses ${amount} ${resource_name}. Remaining: ${newCurrent2}/${resource.max}.`;
    }
    const newCurrent = Math.min(resource.max, resource.current + amount);
    const gained = newCurrent - resource.current;
    if (gained === 0) {
      return `${record.name}'s ${resource_name} is already at maximum (${resource.max}/${resource.max}).`;
    }
    const updated = resources2.map((r, i) => i === idx ? { ...r, current: newCurrent } : r);
    const result = await store.patch(table, record.id, { resources: updated }, record.updated_at);
    if (result === null) continue;
    return `${record.name} recovers ${gained} ${resource_name}. Remaining: ${newCurrent}/${resource.max}.`;
  }
  return `Could not update resource for "${entity}" after ${MAX_RETRIES15} attempts due to concurrent updates. Please retry.`;
}

// src/functions/use_spell_slot.js
var MAX_RETRIES16 = 5;
async function use_spell_slot(params, userSettings2) {
  await ensureMigrations(userSettings2);
  const { game, character, level } = params;
  const store = new SupabaseStore(userSettings2.externalDbUrl, userSettings2.externalDbKey);
  const gameRecord = await store.get("games", game);
  if (!gameRecord) {
    return `No game found with slug "${game}".`;
  }
  for (let attempt = 0; attempt < MAX_RETRIES16; attempt++) {
    const record = await store.get("characters", character, game);
    if (!record || record.game_slug !== game) {
      return `No character found with identifier "${character}" in game "${game}".`;
    }
    const usable = record.spell_slots_usable ?? {};
    const available = usable[String(level)] ?? 0;
    if (available <= 0) {
      return `${record.name} has no level ${level} spell slots remaining.`;
    }
    const newUsable = { ...usable, [String(level)]: available - 1 };
    const updated = await store.patch("characters", record.id, { spell_slots_usable: newUsable }, record.updated_at);
    if (updated === null) continue;
    const remaining = available - 1;
    const total = (record.spell_slots_total ?? {})[String(level)] ?? 0;
    return `${record.name} expends a level ${level} spell slot. Slots remaining: ${remaining}/${total}.`;
  }
  return `Could not expend spell slot for "${character}" after ${MAX_RETRIES16} attempts due to concurrent updates. Please retry.`;
}

// <stdin>
var tools = [
  {
    name: "dnd5e24_advance_time",
    description: "Advances the in-game world time by a number of minutes. Automatically rolls over hours and days. Use after travel, rests, spell durations, or any activity with a known time cost. The updated time is shown in subsequent log_event entries. If world time has not been set, starts from Day 1, 00:00.",
    inputSchema: { "type": "object", "required": ["game", "minutes"], "properties": { "game": { "type": "string", "description": "The slug of the game." }, "minutes": { "type": "integer", "minimum": 1, "description": "Number of minutes to advance (e.g., 60 for 1 hour, 480 for 8 hours, 1440 for 1 day)." }, "note": { "type": "string", "description": "Optional narrative note for this time advance (e.g., 'Party travels to Phandalin', 'Long rest in the inn')." } } },
    handler: advance_time
  },
  {
    name: "dnd5e24_advance_turn",
    description: "Advances to the next combatant's turn in the current combat encounter. When the last combatant in the order acts, wraps back to the top and increments the round counter. Returns who is acting now and the current round number. Call this after each combatant finishes their turn.",
    inputSchema: { "type": "object", "required": ["game"], "properties": { "game": { "type": "string", "description": "The slug of the game." } } },
    handler: advance_turn
  },
  {
    name: "dnd5e24_apply_condition",
    description: "Applies a condition to a character or NPC. Standard D&D 2024 conditions: Blinded, Charmed, Deafened, Frightened, Grappled, Incapacitated, Invisible, Paralyzed, Petrified, Poisoned, Prone, Restrained, Stunned, Unconscious. Exhaustion is tracked with its level (e.g. 'Exhaustion 1', 'Exhaustion 2'). Idempotent: if the condition is already active, returns a no-op success message instead of an error.",
    inputSchema: { "type": "object", "required": ["game", "entity_type", "entity", "condition"], "properties": { "game": { "type": "string", "description": "The slug of the game." }, "entity_type": { "type": "string", "enum": ["character", "npc"], "description": "Whether the target is a player character or an NPC." }, "entity": { "type": "string", "description": "The slug or name of the target character or NPC." }, "condition": { "type": "string", "description": "The condition to apply (e.g. 'Prone', 'Poisoned', 'Exhaustion 1')." } } },
    handler: apply_condition
  },
  {
    name: "dnd5e24_apply_damage",
    description: "Applies damage to a character or NPC with automatic resistance/immunity/vulnerability resolution. Always pass the raw dice roll \u2014 do not pre-adjust for resistances. Temporary HP absorbs damage after resistances are applied. HP floors at 0.\n\nAutomatic side effects when a character drops to 0 HP: the Unconscious condition is applied (unless immune), death saves begin, and any active concentration spell is broken. Instant death occurs if the excess damage equals or exceeds the target's maximum HP.\n\nWhen a concentrating entity takes HP damage but survives above 0 HP, the response includes the required Constitution save DC (max(10, ceil(hp_lost/2))).",
    inputSchema: { "type": "object", "required": ["game", "entity_type", "entity", "amount"], "properties": { "game": { "type": "string", "description": "The slug of the game." }, "entity_type": { "type": "string", "enum": ["character", "npc"], "description": "Whether the target is a player character or an NPC." }, "entity": { "type": "string", "description": "The slug or UUID of the character or NPC to damage." }, "amount": { "type": "integer", "description": "The raw damage amount before resistances (i.e., the dice roll total). Do not halve or double it \u2014 the server applies the correct multiplier.", "minimum": 0 }, "damage_type": { "type": "string", "description": "The type of damage (e.g., Fire, Slashing, Necrotic). Must match the values stored in the target's damage_resistances, damage_immunities, or damage_vulnerabilities. If omitted, no multiplier is applied.", "enum": ["Acid", "Bludgeoning", "Cold", "Fire", "Force", "Lightning", "Necrotic", "Piercing", "Poison", "Psychic", "Radiant", "Slashing", "Thunder", "Nonmagical Bludgeoning", "Nonmagical Piercing", "Nonmagical Slashing"] } } },
    handler: apply_damage
  },
  {
    name: "dnd5e24_apply_damage_bulk",
    description: "Applies damage to multiple targets in a single call. Each target has a multiplier for the save result: 1.0 = full damage (failed save), 0.5 = half damage (successful save), 0.0 = no damage (immune or Evasion pass). The server then applies each entity's own resistances, immunities, and vulnerabilities on top of the multiplier. Auto-applies Unconscious to characters at 0 HP and auto-breaks concentration. Use after roll_saves for AoE spells like Fireball or dragon breath.",
    inputSchema: { "type": "object", "required": ["game", "base_amount", "targets"], "properties": { "game": { "type": "string", "description": "The slug of the game." }, "base_amount": { "type": "integer", "minimum": 0, "description": "Total damage roll before any save multipliers (e.g., the Fireball roll of 28)." }, "damage_type": { "type": "string", "description": "The type of damage. If omitted, no entity resistance multiplier is applied.", "enum": ["Acid", "Bludgeoning", "Cold", "Fire", "Force", "Lightning", "Necrotic", "Piercing", "Poison", "Psychic", "Radiant", "Slashing", "Thunder", "Nonmagical Bludgeoning", "Nonmagical Piercing", "Nonmagical Slashing"] }, "targets": { "type": "array", "minItems": 1, "description": "Targets to damage, each with their individual save result multiplier.", "items": { "type": "object", "required": ["entity", "entity_type", "multiplier"], "properties": { "entity": { "type": "string", "description": "Slug or UUID of the character or NPC." }, "entity_type": { "type": "string", "enum": ["character", "npc"], "description": "Whether this entity is a character or NPC." }, "multiplier": { "type": "number", "description": "Damage multiplier from the save outcome: 1.0 (fail/full), 0.5 (pass/half), 0.0 (no damage). Applied before entity resistances." } } } } } },
    handler: apply_damage_bulk
  },
  {
    name: "dnd5e24_apply_effect",
    description: "Apply a named effect (spell, condition, curse, etc.) to one or more targets. Effects support three independent removal mechanisms that can be combined freely: (1) duration \u2014 auto-expires via advance_turn after a fixed number of rounds; (2) concentration \u2014 cleared automatically when the caster drops concentration via clear_concentration; (3) save to end \u2014 at the end of each of the target's turns, advance_turn rolls the specified saving throw and removes the effect on a success (models Hold Person, Paralyzed, Stunned, etc.). Use list_effects to inspect active effects and remove_effect to end one early.",
    inputSchema: { "type": "object", "required": ["game", "targets", "name"], "properties": { "game": { "type": "string", "description": "The slug of the game." }, "targets": { "type": "array", "minItems": 1, "description": "One or more entities to apply the effect to.", "items": { "type": "object", "required": ["entity_type", "entity"], "properties": { "entity_type": { "type": "string", "enum": ["character", "npc"], "description": "Whether the target is a character or NPC." }, "entity": { "type": "string", "description": "Slug or UUID of the target." } } } }, "name": { "type": "string", "description": "Display name of the effect, e.g. 'Hold Person', 'Bless', 'Poisoned'." }, "source_type": { "type": "string", "enum": ["character", "npc", "system"], "description": "Entity type of the caster or effect source." }, "source": { "type": "string", "description": "Slug of the caster or source. For concentration effects this becomes the concentration owner \u2014 clearing their concentration removes the effect automatically." }, "concentration": { "type": "boolean", "default": false, "description": "Set true for spells that require concentration. When the caster's concentration is cleared (via clear_concentration or at 0 HP), this effect is removed from all targets." }, "duration_rounds": { "type": "integer", "default": -1, "description": "Duration in combat rounds. -1 for indefinite (must be removed manually or via save/concentration). When combat is active the expiry round is computed immediately; outside combat the timer starts when combat begins and apply_effect is called again." }, "end_on_save": { "type": "object", "description": "If present, advance_turn rolls this saving throw at the end of each of the target's turns and removes the effect on a success. Use for Hold Person, Paralyzed, Stunned, Frightened, etc.", "required": ["dc", "ability"], "properties": { "dc": { "type": "integer", "description": "Saving throw DC." }, "ability": { "type": "string", "enum": ["Strength", "Dexterity", "Constitution", "Intelligence", "Wisdom", "Charisma"], "description": "Ability used for the saving throw." } } }, "notes": { "type": "string", "description": "Freeform description of what the effect does mechanically (e.g. 'restrained, attacks have advantage against target'). Not parsed \u2014 kept for the DM's reference." } } },
    handler: apply_effect
  },
  {
    name: "dnd5e24_apply_healing",
    description: "Applies healing to a character or NPC, up to their maximum HP. Healing does not affect temporary HP.",
    inputSchema: { "type": "object", "required": ["game", "entity_type", "entity", "amount"], "properties": { "game": { "type": "string", "description": "The slug of the game." }, "entity_type": { "type": "string", "enum": ["character", "npc"], "description": "Whether the target is a player character or an NPC." }, "entity": { "type": "string", "description": "The slug or UUID of the character or NPC to heal." }, "amount": { "type": "integer", "description": "The amount of HP to restore.", "minimum": 0 }, "temporary": { "type": "boolean", "description": "If true, grants temporary HP instead of restoring current HP. Temporary HP does not stack \u2014 only the higher value is kept." } } },
    handler: apply_healing
  },
  {
    name: "dnd5e24_clear_concentration",
    description: "Clears a character's or NPC's active concentration. Use when concentration is broken by a failed Constitution saving throw, voluntary dropping, or any other effect. Note: apply_damage and apply_damage_bulk automatically break concentration when an entity drops to 0 HP.",
    inputSchema: { "type": "object", "required": ["game", "entity_type", "entity"], "properties": { "game": { "type": "string", "description": "The slug of the game." }, "entity_type": { "type": "string", "enum": ["character", "npc"], "description": "Whether the target is a player character or NPC." }, "entity": { "type": "string", "description": "Slug or UUID of the character or NPC." } } },
    handler: clear_concentration
  },
  {
    name: "dnd5e24_create_game",
    description: "Creates a new D&D game session. All other functions require a game slug, so this must be called first.",
    inputSchema: { "type": "object", "required": ["slug", "name"], "properties": { "slug": { "type": "string", "description": "A unique, URL-safe identifier for the game (e.g., 'lost-mines-2024'). Used to reference this game in all other function calls." }, "name": { "type": "string", "description": "The display name of the game (e.g., 'Lost Mines of Phandelver')." }, "description": { "type": "string", "description": "Optional notes or description for the game." } } },
    handler: create_game
  },
  {
    name: "dnd5e24_delete_character",
    description: "Permanently deletes a player character from a game by slug. This is irreversible.",
    inputSchema: { "type": "object", "required": ["game", "slug"], "properties": { "game": { "type": "string", "description": "The slug of the game the character belongs to." }, "slug": { "type": "string", "description": "The slug of the character to delete." } } },
    handler: delete_character
  },
  {
    name: "dnd5e24_delete_game",
    description: "Permanently deletes a game and all its associated data (characters, NPCs, memories). This is irreversible. Requires confirm_name to exactly match the game's name as a safeguard against accidental deletion.",
    inputSchema: { "type": "object", "required": ["slug", "confirm_name"], "properties": { "slug": { "type": "string", "description": "The slug of the game to delete." }, "confirm_name": { "type": "string", "description": "Must exactly match the game's name (case-sensitive). Use list_games or the game's known name. Deletion is rejected if this does not match." } } },
    handler: delete_game
  },
  {
    name: "dnd5e24_delete_memory",
    description: "Deletes a memory from a game by its slug.",
    inputSchema: { "type": "object", "required": ["game", "slug"], "properties": { "game": { "type": "string", "description": "The slug of the game." }, "slug": { "type": "string", "description": "The slug of the memory to delete." } } },
    handler: delete_memory
  },
  {
    name: "dnd5e24_delete_npc",
    description: "Permanently deletes an NPC from a game by slug. This is irreversible.",
    inputSchema: { "type": "object", "required": ["game", "slug"], "properties": { "game": { "type": "string", "description": "The slug of the game the NPC belongs to." }, "slug": { "type": "string", "description": "The slug of the NPC to delete." } } },
    handler: delete_npc
  },
  {
    name: "dnd5e24_end_combat",
    description: "Ends the current combat encounter for a game, clearing all initiative and round tracking state. Call this when the encounter is resolved (all enemies defeated, combat fled, etc.).",
    inputSchema: { "type": "object", "required": ["game"], "properties": { "game": { "type": "string", "description": "The slug of the game." } } },
    handler: end_combat
  },
  {
    name: "dnd5e24_get_character",
    description: "Returns the full character sheet for a player character, looked up by slug or UUID. Includes a 'derived' block with computed fields: level (from xp), xp_for/to_next_level, pb, ability_modifiers, save_modifiers, skill_modifiers, initiative, passive_perception, spell_save_dc, spell_attack_bonus.",
    inputSchema: { "type": "object", "required": ["game", "character"], "properties": { "game": { "type": "string", "description": "The slug of the game." }, "character": { "type": "string", "description": "The slug or UUID of the character." } } },
    handler: get_character
  },
  {
    name: "dnd5e24_get_npc",
    description: "Returns the full stat block for an NPC, looked up by slug or UUID. Includes a 'derived' block with computed fields: pb, ability_modifiers, save_modifiers, skill_modifiers, initiative, passive_perception, spell_save_dc, spell_attack_bonus.",
    inputSchema: { "type": "object", "required": ["game", "npc"], "properties": { "game": { "type": "string", "description": "The slug of the game." }, "npc": { "type": "string", "description": "The slug or UUID of the NPC." } } },
    handler: get_npc
  },
  {
    name: "dnd5e24_give_item",
    description: "Adds an item to a character's or NPC's equipment list. Stacking-aware: if an entry with the same item name already exists (plain or as 'Item (xN)'), its count is incremented rather than adding a duplicate. Use quantity > 1 to add multiple at once.",
    inputSchema: { "type": "object", "required": ["game", "entity_type", "entity", "item"], "properties": { "game": { "type": "string", "description": "The slug of the game." }, "entity_type": { "type": "string", "enum": ["character", "npc"], "description": "Whether the target is a player character or an NPC." }, "entity": { "type": "string", "description": "The slug or UUID of the character or NPC." }, "item": { "type": "string", "description": "The item name (e.g., 'Longsword +1', 'Potion of Healing', 'Arrow'). If a matching entry already exists, its quantity is incremented." }, "quantity": { "type": "integer", "minimum": 1, "description": "Number of items to add. Defaults to 1. Stacks with any existing entry of the same name." } } },
    handler: give_item
  },
  {
    name: "dnd5e24_grant_xp",
    description: "Grants experience points to one or more player characters in a game. If no characters are specified, XP is granted to all characters in the game (the whole party). Returns the new XP total for each affected character.",
    inputSchema: { "type": "object", "required": ["game", "amount"], "properties": { "game": { "type": "string", "description": "The slug of the game." }, "amount": { "type": "integer", "description": "The amount of XP to grant to each character.", "minimum": 1 }, "characters": { "type": "array", "description": "Slugs or names of the characters to receive XP. If omitted, all characters in the game are awarded.", "items": { "type": "string" } } } },
    handler: grant_xp
  },
  {
    name: "dnd5e24_list_characters",
    description: "Lists all player characters in a game. Returns slug, name, current_hp, max_hp, temporary_hp, ac, conditions, and a derived block (level, pb, ability_modifiers, save/skill modifiers, initiative, passive_perception, spell_save_dc, spell_attack_bonus, xp_to_next_level) by default. Pass fields to request additional or different columns; include 'derived' to get computed fields.",
    inputSchema: { "type": "object", "required": ["game"], "properties": { "game": { "type": "string", "description": "The slug of the game." }, "fields": { "type": "array", "items": { "type": "string" }, "description": "Optional list of column names to include in each result. Defaults to [slug, name, current_hp, max_hp, temporary_hp, ac, conditions, derived]. Use 'derived' to include computed fields." } } },
    handler: list_characters
  },
  {
    name: "dnd5e24_list_effects",
    description: "List all active effects (buffs, debuffs, spells) in a game, optionally filtered to a specific entity. Shows effect name, source, duration (rounds remaining / expiry round), concentration owner, and the full modifier list. The short ID shown in brackets can be passed to remove_effect.",
    inputSchema: { "type": "object", "required": ["game"], "properties": { "game": { "type": "string", "description": "The slug of the game." }, "entity_type": { "type": "string", "enum": ["character", "npc"], "description": "Optional: filter to effects targeting this entity type." }, "entity": { "type": "string", "description": "Optional: filter to effects on this specific entity (slug or UUID)." } } },
    handler: list_effects
  },
  {
    name: "dnd5e24_list_games",
    description: "Lists all games with a summary (slug, name, description).",
    inputSchema: { "type": "object", "required": [], "properties": {} },
    handler: list_games
  },
  {
    name: "dnd5e24_list_log",
    description: "Returns session log entries for a game in chronological order. Use at the start of a session to recap what happened last time, or to review a specific category of events. Entries include in-game timestamps when world time tracking is active.",
    inputSchema: { "type": "object", "required": ["game"], "properties": { "game": { "type": "string", "description": "The slug of the game." }, "category": { "type": "string", "description": "Filter by category. Returns only entries of this type.", "enum": ["combat", "plot", "loot", "roleplay", "travel", "rest", "death"] }, "limit": { "type": "integer", "minimum": 1, "maximum": 200, "description": "Maximum number of entries to return, most recent first within the window. Defaults to 50." } } },
    handler: list_log
  },
  {
    name: "dnd5e24_list_memories",
    description: "Lists memories for a game, returning slug, name, full text, and tags. Call at the start of every session to load context. Use the tag parameter to retrieve only a relevant subset (e.g., tag='npc' for NPC notes, tag='plot' for quest state) instead of loading all memories.",
    inputSchema: { "type": "object", "required": ["game"], "properties": { "game": { "type": "string", "description": "The slug of the game." }, "tag": { "type": "string", "description": "If provided, returns only memories that include this tag. Useful for targeted recall (e.g., 'npc', 'plot', 'faction', 'location')." } } },
    handler: list_memories
  },
  {
    name: "dnd5e24_list_npcs",
    description: "Lists all NPCs in a game with a summary (slug, name, CR, AC, HP, conditions, and a derived block with pb, ability_modifiers, save/skill modifiers, initiative, passive_perception, spell_save_dc, spell_attack_bonus). Pass fields to request additional or different columns; include 'derived' to get computed fields. For a full statblock, look up the NPC by slug.",
    inputSchema: { "type": "object", "required": ["game"], "properties": { "game": { "type": "string", "description": "The slug of the game." }, "fields": { "type": "array", "items": { "type": "string" }, "description": "Optional list of column names to include in each result. Defaults to [slug, name, cr, ac, current_hp, max_hp, temporary_hp, conditions, derived]. Use 'derived' to include computed fields." } } },
    handler: list_npcs
  },
  {
    name: "dnd5e24_log_event",
    description: "Appends a session log entry for a game. Use this throughout the session to record significant events: combat outcomes, plot developments, NPC interactions, loot found, and decisions made. Entries are automatically timestamped with the current in-game world time (if set). Use list_log to review the log at the start of the next session.",
    inputSchema: { "type": "object", "required": ["game", "entry"], "properties": { "game": { "type": "string", "description": "The slug of the game." }, "entry": { "type": "string", "description": "The event to record (e.g., 'Party defeated the goblin war band; Aragorn dropped to 0 HP and was stabilized by Gandalf.')." }, "category": { "type": "string", "description": "Optional category for filtering. Suggested values: 'combat', 'plot', 'loot', 'roleplay', 'travel', 'rest', 'death'.", "enum": ["combat", "plot", "loot", "roleplay", "travel", "rest", "death"] } } },
    handler: log_event
  },
  {
    name: "dnd5e24_remove_condition",
    description: "Removes an active condition from a character or NPC. Returns an error if the condition is not currently applied.",
    inputSchema: { "type": "object", "required": ["game", "entity_type", "entity", "condition"], "properties": { "game": { "type": "string", "description": "The slug of the game." }, "entity_type": { "type": "string", "enum": ["character", "npc"], "description": "Whether the target is a player character or an NPC." }, "entity": { "type": "string", "description": "The slug or name of the target character or NPC." }, "condition": { "type": "string", "description": "The condition to remove (e.g. 'Prone', 'Poisoned', 'Exhaustion 1')." } } },
    handler: remove_condition
  },
  {
    name: "dnd5e24_remove_effect",
    description: "Manually remove an active effect. Use when a spell is dispelled, a condition is cured, or an effect should end early. Prefer clear_concentration to remove concentration spells (it removes both the caster's concentration and all linked effects at once). Identify by effect_id (the 8-character prefix shown in list_effects) or by name + optional target.",
    inputSchema: { "type": "object", "required": ["game"], "properties": { "game": { "type": "string", "description": "The slug of the game." }, "effect_id": { "type": "string", "description": "UUID or 8-character prefix (as shown in list_effects) of the specific effect to remove." }, "name": { "type": "string", "description": "Name of the effect to remove (e.g. 'Bless'). Removes all matching instances if target is omitted." }, "target_type": { "type": "string", "enum": ["character", "npc"], "description": "Narrow removal to effects on this entity type." }, "target": { "type": "string", "description": "Narrow removal to this specific entity (slug or UUID)." } } },
    handler: remove_effect
  },
  {
    name: "dnd5e24_remove_item",
    description: "Removes one or more of an item from a character's or NPC's equipment list. Stacking-aware: finds the first entry matching the item name (plain or as 'Item (xN)') and decrements its count. If the count reaches zero the entry is removed; if it reaches one the '(xN)' suffix is dropped.",
    inputSchema: { "type": "object", "required": ["game", "entity_type", "entity", "item"], "properties": { "game": { "type": "string", "description": "The slug of the game." }, "entity_type": { "type": "string", "enum": ["character", "npc"], "description": "Whether the target is a player character or an NPC." }, "entity": { "type": "string", "description": "The slug or UUID of the character or NPC." }, "item": { "type": "string", "description": "The item name to remove. Matches against the plain name or the 'Item (xN)' grouped form." }, "quantity": { "type": "integer", "minimum": 1, "description": "Number of items to remove. Defaults to 1. If this exceeds the current stack size the entry is removed entirely." } } },
    handler: remove_item
  },
  {
    name: "dnd5e24_rest",
    description: "Applies the effects of a short or long rest to all player characters in a game. Long rest: restores HP to maximum, clears temporary HP, and restores all spell slots. Short rest: restores Pact Magic spell slots for Warlock characters (the only class that recharges spell slots on a short rest in D&D 2024); other characters receive no automated changes (HP recovery via Hit Dice is handled narratively).",
    inputSchema: { "type": "object", "required": ["game", "rest_type"], "properties": { "game": { "type": "string", "description": "The slug of the game." }, "rest_type": { "type": "string", "enum": ["short", "long"], "description": "The type of rest: 'short' (1 hour) or 'long' (8 hours)." } } },
    handler: rest
  },
  {
    name: "dnd5e24_roll_death_save",
    description: "Records the outcome of a death saving throw for an unconscious character at 0 HP. Roll 1d20 yourself, then call this with the outcome. A natural 20 is a critical success (character regains 1 HP and stabilizes). A natural 1 is a critical failure (counts as two failures). Three successes stabilizes the character; three failures means death.",
    inputSchema: { "type": "object", "required": ["game", "character", "outcome"], "properties": { "game": { "type": "string", "description": "The slug of the game." }, "character": { "type": "string", "description": "Slug or UUID of the character making the death save." }, "outcome": { "type": "string", "description": "Result of the death saving throw. 'success' = roll 10\u201319, 'failure' = roll 2\u20139, 'critical_success' = natural 20 (character regains 1 HP and stabilizes), 'critical_failure' = natural 1 (counts as two failures).", "enum": ["success", "failure", "critical_success", "critical_failure"] } } },
    handler: roll_death_save
  },
  {
    name: "dnd5e24_roll_dice",
    description: 'Roll dice using standard dice notation. Supports basic rolls, keep/drop, exploding, reroll, fudge, percentile, min/max functions, and math. Use mode "system" for a quick total, "transparent" for a full per-die breakdown, or "user" to prompt the user to enter physical dice results (falls back to auto-roll if the platform does not support user input).',
    inputSchema: { "type": "object", "required": ["expression"], "properties": { "expression": { "type": "string", "description": 'Dice expression, or comma-separated list for multiple rolls at once (e.g. "2d6, d8+2, 4d6k3"). Top-level commas separate expressions; commas inside min()/max() are part of those functions. Supported notation:\n\u2022 Basic: 2d6, d20, d% (percentile), 4dF (Fudge/FATE dice)\n\u2022 Keep/Drop: 4d6k3 (keep highest 3), 5d8d2 (drop lowest 2)\n\u2022 Exploding: 3d6! or 3d6e (explode on max), 2d10e8 (explode on 8+), 3d6!! (compound)\n\u2022 Reroll: 4d6r1 (reroll \u22641, once)\n\u2022 Functions: min(2d6, 3d4), max(d20, d12+5)\n\u2022 Math: d20+5, 2d6*3, (2d4+1)*2' }, "mode": { "type": "string", "enum": ["system", "transparent", "user"], "description": '"system" returns just the total; "transparent" shows per-group breakdown and the full evaluation chain; "user" prompts the user to enter results from physical dice (auto-rolls with full breakdown if the platform does not support user input prompts).', "default": "system" }, "description": { "type": "string", "description": 'Optional label for this roll or group of rolls, e.g. "Attack roll" or "Initiative".' } } },
    handler: roll_dice
  },
  {
    name: "dnd5e24_roll_saves",
    description: "Rolls saving throws for multiple entities at once against a given DC. Automatically uses each entity's relevant ability score and saving throw proficiency bonus. Returns pass/fail results for all targets in one call. Use before apply_damage_bulk for AoE spells (Fireball, Cone of Cold, dragon breath, etc.).",
    inputSchema: { "type": "object", "required": ["game", "dc", "ability", "entities"], "properties": { "game": { "type": "string", "description": "The slug of the game." }, "dc": { "type": "integer", "minimum": 1, "description": "The saving throw DC." }, "ability": { "type": "string", "enum": ["Strength", "Dexterity", "Constitution", "Intelligence", "Wisdom", "Charisma"], "description": "The ability score used for the saving throw." }, "entities": { "type": "array", "minItems": 1, "description": "Entities making the saving throw.", "items": { "type": "object", "required": ["entity", "entity_type"], "properties": { "entity": { "type": "string", "description": "Slug or UUID of the character or NPC." }, "entity_type": { "type": "string", "enum": ["character", "npc"], "description": "Whether this entity is a character or NPC." } } } } } },
    handler: roll_saves
  },
  {
    name: "dnd5e24_set_concentration",
    description: "Sets a character's or NPC's active concentration spell. If they were already concentrating on a different spell, that concentration is automatically broken. Call this when a caster successfully casts a concentration spell (Bless, Hex, Hold Person, Hunter's Mark, Spiritual Weapon, etc.).",
    inputSchema: { "type": "object", "required": ["game", "entity_type", "entity", "spell"], "properties": { "game": { "type": "string", "description": "The slug of the game." }, "entity_type": { "type": "string", "enum": ["character", "npc"], "description": "Whether the caster is a player character or NPC." }, "entity": { "type": "string", "description": "Slug or UUID of the caster." }, "spell": { "type": "string", "description": `Name of the concentration spell being cast (e.g., 'Bless', 'Hold Person', 'Hex', "Hunter's Mark").` } } },
    handler: set_concentration
  },
  {
    name: "dnd5e24_set_hp",
    description: "Sets HP values directly on a character or NPC. Use for corrections, level-up max HP increases, or effects that set HP to a specific value rather than applying damage or healing. Prefer apply_damage and apply_healing for combat. Clears death saves when reviving a character from 0 HP.",
    inputSchema: { "type": "object", "required": ["game", "entity_type", "entity"], "properties": { "game": { "type": "string", "description": "The slug of the game." }, "entity_type": { "type": "string", "enum": ["character", "npc"], "description": "Whether the target is a player character or an NPC." }, "entity": { "type": "string", "description": "The slug or UUID of the character or NPC." }, "current_hp": { "type": "integer", "minimum": 0, "description": "New current HP. Clamped to [0, max_hp]. At least one of current_hp or max_hp must be provided." }, "max_hp": { "type": "integer", "minimum": 1, "description": "New maximum HP. At least one of current_hp or max_hp must be provided." } } },
    handler: set_hp
  },
  {
    name: "dnd5e24_set_world_time",
    description: "Sets the current in-game world time. Call this at the start of a campaign or after a time jump. World time is automatically attached to session log entries and shown in advance_time output. Use advance_time to move time forward incrementally.",
    inputSchema: { "type": "object", "required": ["game", "day"], "properties": { "game": { "type": "string", "description": "The slug of the game." }, "day": { "type": "integer", "minimum": 1, "description": "The campaign day (e.g., 1 for the first day of the adventure)." }, "hour": { "type": "integer", "minimum": 0, "maximum": 23, "description": "Hour of day (0\u201323). Defaults to 0." }, "minute": { "type": "integer", "minimum": 0, "maximum": 59, "description": "Minute (0\u201359). Defaults to 0." }, "note": { "type": "string", "description": "Optional narrative note describing the time (e.g., 'Dawn, first day in Neverwinter')." } } },
    handler: set_world_time
  },
  {
    name: "dnd5e24_stabilize_character",
    description: "Stabilizes a character at 0 HP, clearing their death saving throw counters. A stabilized character remains unconscious but no longer makes death saves each round. Use when a Medicine check (DC 10) succeeds, Spare the Dying is cast, or any other effect stabilizes without healing.",
    inputSchema: { "type": "object", "required": ["game", "character"], "properties": { "game": { "type": "string", "description": "The slug of the game." }, "character": { "type": "string", "description": "The slug or UUID of the character to stabilize." } } },
    handler: stabilize_character
  },
  {
    name: "dnd5e24_start_combat",
    description: "Begins a combat encounter for a game. Sets the initiative order and advances to round 1. Each combatant entry requires a slug, entity type, and display name. If initiative is omitted for a combatant, it is auto-rolled as 1d20 + DEX modifier using the entity's stored stats. The turn order is sorted from highest to lowest initiative. Call advance_turn after each combatant acts.",
    inputSchema: { "type": "object", "required": ["game", "combatants"], "properties": { "game": { "type": "string", "description": "The slug of the game." }, "combatants": { "type": "array", "description": "All combatants entering initiative, in any order. Will be sorted by initiative descending.", "minItems": 1, "items": { "type": "object", "required": ["slug", "entity_type", "name"], "properties": { "slug": { "type": "string", "description": "The entity's slug (or UUID)." }, "entity_type": { "type": "string", "enum": ["character", "npc"], "description": "Whether this combatant is a player character or NPC." }, "name": { "type": "string", "description": "Display name used in turn announcements." }, "initiative": { "type": "integer", "description": "Initiative roll result (higher goes first). If omitted, auto-rolled as 1d20 + DEX modifier from the entity's stats." } } } } } },
    handler: start_combat
  },
  {
    name: "dnd5e24_transfer_item",
    description: "Transfers an item from one character or NPC's equipment to another's. Removes from the source first, then adds to the destination.",
    inputSchema: { "type": "object", "required": ["game", "from_entity_type", "from_entity", "to_entity_type", "to_entity", "item"], "properties": { "game": { "type": "string", "description": "The slug of the game." }, "from_entity_type": { "type": "string", "enum": ["character", "npc"], "description": "Entity type of the source." }, "from_entity": { "type": "string", "description": "Slug or UUID of the source character or NPC." }, "to_entity_type": { "type": "string", "enum": ["character", "npc"], "description": "Entity type of the destination." }, "to_entity": { "type": "string", "description": "Slug or UUID of the destination character or NPC." }, "item": { "type": "string", "description": "Exact item string to transfer (must match an entry in the source's equipment list)." } } },
    handler: transfer_item
  },
  {
    name: "dnd5e24_update_game",
    description: "Updates the name or description of an existing game.",
    inputSchema: { "type": "object", "required": ["game"], "properties": { "game": { "type": "string", "description": "The slug or UUID of the game to update." }, "name": { "type": "string", "description": "New display name for the game." }, "description": { "type": "string", "description": "New notes or description for the game." } } },
    handler: update_game
  },
  {
    name: "dnd5e24_upsert_character",
    description: "Creates a new player character (PC) or updates an existing one in a game. If a character with the given slug already exists in the game, only the provided fields are updated (partial update). If no slug is given, one is auto-generated from the name.",
    inputSchema: { "type": "object", "required": ["game", "name"], "properties": { "game": { "type": "string", "description": "The slug of the game this character belongs to." }, "slug": { "type": "string", "description": "Unique identifier for this character within the game (e.g., 'thorin-ironforge'). Auto-generated from name if omitted. Enforced unique per game." }, "name": { "type": "string", "description": "The character's name." }, "player": { "type": "string", "description": "The name of the player controlling this character." }, "species": { "type": "string", "description": "The character's species (e.g., Human, Elf, Dwarf)." }, "class_name": { "type": "string", "description": "The character's primary class (e.g., Fighter, Wizard, Rogue)." }, "subclass": { "type": "string", "description": "The character's subclass (e.g., Champion, Evocation, Arcane Trickster)." }, "level": { "type": "integer", "description": "The character's level (1\u201320). Defaults to 1 on creation.", "minimum": 1, "maximum": 20 }, "background": { "type": "string", "description": "The character's background (e.g., Soldier, Sage, Acolyte)." }, "ac": { "type": "integer", "description": "Armor Class." }, "max_hp": { "type": "integer", "description": "Maximum hit points." }, "current_hp": { "type": "integer", "description": "Current hit points. Defaults to max_hp on creation." }, "temporary_hp": { "type": "integer", "description": "Temporary hit points. Defaults to 0 on creation." }, "speeds": { "type": "string", "description": "Movement speeds (e.g., '30 ft., swim 30 ft.')." }, "strength": { "type": "integer", "description": "Strength score." }, "dexterity": { "type": "integer", "description": "Dexterity score." }, "constitution": { "type": "integer", "description": "Constitution score." }, "intelligence": { "type": "integer", "description": "Intelligence score." }, "wisdom": { "type": "integer", "description": "Wisdom score." }, "charisma": { "type": "integer", "description": "Charisma score." }, "pb": { "type": "integer", "description": "Proficiency bonus." }, "proficiencies": { "type": "array", "description": "Saving throw and skill proficiencies.", "items": { "type": "string", "enum": ["Strength Save", "Dexterity Save", "Constitution Save", "Intelligence Save", "Wisdom Save", "Charisma Save", "Acrobatics", "Animal Handling", "Arcana", "Athletics", "Deception", "History", "Insight", "Intimidation", "Investigation", "Medicine", "Nature", "Perception", "Performance", "Persuasion", "Religion", "Sleight of Hand", "Stealth", "Survival"] } }, "expertise": { "type": "array", "description": "Skills the character has expertise in (double proficiency bonus).", "items": { "type": "string", "enum": ["Acrobatics", "Animal Handling", "Arcana", "Athletics", "Deception", "History", "Insight", "Intimidation", "Investigation", "Medicine", "Nature", "Perception", "Performance", "Persuasion", "Religion", "Sleight of Hand", "Stealth", "Survival"] } }, "weapon_mastery": { "type": "array", "description": "Weapons the character has mastery with (D&D 2024).", "items": { "type": "string", "enum": ["Club", "Dagger", "Greatclub", "Handaxe", "Javelin", "Light Hammer", "Mace", "Quarterstaff", "Sickle", "Spear", "Dart", "Light Crossbow", "Shortbow", "Sling", "Battleaxe", "Flail", "Glaive", "Greataxe", "Greatsword", "Halberd", "Lance", "Longsword", "Maul", "Morningstar", "Pike", "Rapier", "Scimitar", "Shortsword", "Trident", "War Pick", "Warhammer", "Whip", "Blowgun", "Hand Crossbow", "Heavy Crossbow", "Longbow", "Musket", "Pistol"] } }, "spellcasting_ability": { "type": "string", "description": "The ability score used for spellcasting.", "enum": ["Strength", "Dexterity", "Constitution", "Intelligence", "Wisdom", "Charisma"] }, "spells_known": { "type": "array", "description": "Spells the character knows (spontaneous casters).", "items": { "type": "string" } }, "spells_prepared": { "type": "array", "description": "Spells the character has prepared.", "items": { "type": "string" } }, "spell_slots_total": { "type": "object", "description": "Total spell slots per level (1\u20139) per day.", "properties": { "1": { "type": "integer" }, "2": { "type": "integer" }, "3": { "type": "integer" }, "4": { "type": "integer" }, "5": { "type": "integer" }, "6": { "type": "integer" }, "7": { "type": "integer" }, "8": { "type": "integer" }, "9": { "type": "integer" } } }, "spell_slots_usable": { "type": "object", "description": "Remaining spell slots per level (1\u20139). Defaults to spell_slots_total on creation.", "properties": { "1": { "type": "integer" }, "2": { "type": "integer" }, "3": { "type": "integer" }, "4": { "type": "integer" }, "5": { "type": "integer" }, "6": { "type": "integer" }, "7": { "type": "integer" }, "8": { "type": "integer" }, "9": { "type": "integer" } } }, "senses": { "type": "string", "description": "Special senses (e.g., 'Darkvision 60 ft., Passive Perception 14')." }, "languages": { "type": "array", "description": "Languages the character speaks.", "items": { "type": "string", "enum": ["Common", "Common Sign Language", "Dwarvish", "Elvish", "Giant", "Gnomish", "Goblin", "Halfling", "Orcish", "Abyssal", "Celestial", "Deep Speech", "Draconic", "Druidic", "Infernal", "Primordial", "Aquan", "Auran", "Ignan", "Terran", "Sylvan", "Thieves' Cant", "Undercommon"] } }, "damage_resistances": { "type": "array", "description": "Damage types the character is resistant to (takes half damage).", "items": { "type": "string", "enum": ["Acid", "Bludgeoning", "Cold", "Fire", "Force", "Lightning", "Necrotic", "Piercing", "Poison", "Psychic", "Radiant", "Slashing", "Thunder", "Nonmagical Bludgeoning", "Nonmagical Piercing", "Nonmagical Slashing"] } }, "damage_immunities": { "type": "array", "description": "Damage types the character is immune to (takes no damage).", "items": { "type": "string", "enum": ["Acid", "Bludgeoning", "Cold", "Fire", "Force", "Lightning", "Necrotic", "Piercing", "Poison", "Psychic", "Radiant", "Slashing", "Thunder", "Nonmagical Bludgeoning", "Nonmagical Piercing", "Nonmagical Slashing"] } }, "damage_vulnerabilities": { "type": "array", "description": "Damage types the character is vulnerable to (takes double damage).", "items": { "type": "string", "enum": ["Acid", "Bludgeoning", "Cold", "Fire", "Force", "Lightning", "Necrotic", "Piercing", "Poison", "Psychic", "Radiant", "Slashing", "Thunder"] } }, "condition_immunities": { "type": "array", "description": "Conditions the character is immune to.", "items": { "type": "string", "enum": ["Blinded", "Charmed", "Deafened", "Exhaustion", "Frightened", "Grappled", "Incapacitated", "Invisible", "Paralyzed", "Petrified", "Poisoned", "Prone", "Restrained", "Stunned", "Unconscious"] } }, "conditions": { "type": "array", "description": "Currently active conditions on the character. Standard conditions: Blinded, Charmed, Deafened, Frightened, Grappled, Incapacitated, Invisible, Paralyzed, Petrified, Poisoned, Prone, Restrained, Stunned, Unconscious. Exhaustion is tracked with its level (e.g. 'Exhaustion 1'). Prefer apply_condition and remove_condition for incremental updates.", "items": { "type": "string" } }, "features": { "type": "array", "description": "Class features, subclass features, feats, and background abilities.", "items": { "type": "object", "properties": { "name": { "type": "string" }, "description": { "type": "string" } }, "required": ["name", "description"] } }, "equipment": { "type": "array", "description": "Equipment and items carried by the character.", "items": { "type": "string" } }, "notes": { "type": "string", "description": "Freeform notes about the character." }, "gold": { "type": "number", "description": "The character's wealth in gold pieces (GP). Fractional values represent electrum, silver, and copper equivalents.", "minimum": 0 }, "xp": { "type": "integer", "description": "Total experience points earned by the character.", "minimum": 0 }, "resources": { "type": "array", "description": "Class resource pools (Rage, Ki, Channel Divinity, Action Surge, Bardic Inspiration, etc.). Each resource tracks current/max uses and how it recovers. Use use_resource to spend or restore individual resources.", "items": { "type": "object", "required": ["name", "current", "max", "recovery_rules"], "properties": { "name": { "type": "string", "description": "Display name of the resource (e.g. 'Rage', 'Ki', 'Channel Divinity')." }, "current": { "type": "integer", "description": "Current remaining uses.", "minimum": 0 }, "max": { "type": "integer", "description": "Maximum uses.", "minimum": 1 }, "recovery_rules": { "type": "array", "description": "One or more recovery rules for this resource. Most resources have a single rule (e.g. full on long rest), but some have multiple \u2014 e.g. Second Wind recovers 1 use on short rest and all uses on long rest, so it needs two rules. On rest, all matching rules are evaluated and the one granting the greatest recovery is applied.", "minItems": 1, "items": { "type": "object", "required": ["amount", "frequency"], "properties": { "amount": { "type": "string", "description": "How much is recovered. Use 'full' to restore to max, an integer string like '2' to restore by a fixed amount, or dice notation like '1d6' for a rolled recovery (dice amounts must be applied manually via use_resource after rolling)." }, "frequency": { "type": "string", "description": "When this rule applies.", "enum": ["short_rest", "long_rest", "dawn"] } } } } } } }, "death_save_successes": { "type": "integer", "description": "Number of successful death saving throws (0\u20133). Managed by roll_death_save. Reset to 0 on stabilization, revival, or rest.", "minimum": 0, "maximum": 3 }, "death_save_failures": { "type": "integer", "description": "Number of failed death saving throws (0\u20133). Managed by roll_death_save. Reset to 0 on stabilization, revival, or rest.", "minimum": 0, "maximum": 3 } } },
    handler: upsert_character
  },
  {
    name: "dnd5e24_upsert_memory",
    description: "Creates or updates a named memory for a game. If a memory with the given slug already exists, its name, text, and tags are updated. Use this to record world lore, NPC decisions, plot developments, or anything the DM should remember across sessions. Memories can be tagged for selective retrieval via list_memories.",
    inputSchema: { "type": "object", "required": ["game", "slug", "name", "memory"], "properties": { "game": { "type": "string", "description": "The slug of the game this memory belongs to." }, "slug": { "type": "string", "description": "A unique, URL-safe identifier for this memory within the game (e.g., 'mayor-betrayal'). Used to update or delete the memory later." }, "name": { "type": "string", "description": "A short descriptive label for the memory (e.g., 'Mayor Thornwick betrayed the party')." }, "memory": { "type": "string", "description": "The full memory text." }, "tags": { "type": "array", "items": { "type": "string" }, "description": "Optional tags for filtering (e.g., ['npc', 'plot', 'neverwinter']). Replaces existing tags if the memory already exists." } } },
    handler: upsert_memory
  },
  {
    name: "dnd5e24_upsert_npc",
    description: "Creates a new Non-Player Character (NPC) or updates an existing one in a game. If an NPC with the given slug already exists in the game, only the provided fields are updated (partial update). If no slug is given, one is auto-generated from the name.",
    inputSchema: { "type": "object", "required": ["game", "name"], "properties": { "game": { "type": "string", "description": "The slug of the game this NPC belongs to." }, "slug": { "type": "string", "description": "Unique identifier for this NPC within the game (e.g., 'goblin-king'). Auto-generated from name if omitted. Enforced unique per game." }, "name": { "type": "string", "description": "The name of the NPC." }, "species": { "type": "string", "description": "The species of the NPC (e.g., Human, Elf)." }, "size": { "type": "string", "description": "The size category of the NPC.", "enum": ["Tiny", "Small", "Medium", "Large", "Huge", "Gargantuan"] }, "creature_type": { "type": "string", "description": "The creature type of the NPC.", "enum": ["Aberration", "Beast", "Celestial", "Construct", "Dragon", "Elemental", "Fey", "Fiend", "Giant", "Humanoid", "Monstrosity", "Ooze", "Plant", "Undead"] }, "alignment": { "type": "string", "description": "The alignment of the NPC (e.g., 'Chaotic Evil', 'Neutral Good', 'Unaligned')." }, "ac": { "type": "integer", "description": "Armor Class." }, "max_hp": { "type": "integer", "description": "Maximum hit points." }, "current_hp": { "type": "integer", "description": "Current hit points. Defaults to max_hp on creation." }, "temporary_hp": { "type": "integer", "description": "Temporary hit points. Defaults to 0 on creation." }, "speeds": { "type": "string", "description": "Movement speeds (e.g., '30ft, fly 60ft')." }, "strength": { "type": "integer", "description": "Strength score." }, "dexterity": { "type": "integer", "description": "Dexterity score." }, "constitution": { "type": "integer", "description": "Constitution score." }, "intelligence": { "type": "integer", "description": "Intelligence score." }, "wisdom": { "type": "integer", "description": "Wisdom score." }, "charisma": { "type": "integer", "description": "Charisma score." }, "pb": { "type": "integer", "description": "Proficiency bonus." }, "cr": { "type": "string", "description": "Challenge Rating (e.g., '1/4', '5', '20')." }, "proficiencies": { "type": "array", "description": "Saving throw and skill proficiencies.", "items": { "type": "string", "enum": ["Strength Save", "Dexterity Save", "Constitution Save", "Intelligence Save", "Wisdom Save", "Charisma Save", "Acrobatics", "Animal Handling", "Arcana", "Athletics", "Deception", "History", "Insight", "Intimidation", "Investigation", "Medicine", "Nature", "Perception", "Performance", "Persuasion", "Religion", "Sleight of Hand", "Stealth", "Survival"] } }, "expertise": { "type": "array", "description": "Skills the NPC has expertise in (double proficiency bonus).", "items": { "type": "string", "enum": ["Acrobatics", "Animal Handling", "Arcana", "Athletics", "Deception", "History", "Insight", "Intimidation", "Investigation", "Medicine", "Nature", "Perception", "Performance", "Persuasion", "Religion", "Sleight of Hand", "Stealth", "Survival"] } }, "weapon_mastery": { "type": "array", "description": "Weapons the NPC has mastery with (D&D 2024).", "items": { "type": "string", "enum": ["Club", "Dagger", "Greatclub", "Handaxe", "Javelin", "Light Hammer", "Mace", "Quarterstaff", "Sickle", "Spear", "Dart", "Light Crossbow", "Shortbow", "Sling", "Battleaxe", "Flail", "Glaive", "Greataxe", "Greatsword", "Halberd", "Lance", "Longsword", "Maul", "Morningstar", "Pike", "Rapier", "Scimitar", "Shortsword", "Trident", "War Pick", "Warhammer", "Whip", "Blowgun", "Hand Crossbow", "Heavy Crossbow", "Longbow", "Musket", "Pistol"] } }, "spellcasting_ability": { "type": "string", "description": "The ability score used for spellcasting.", "enum": ["Strength", "Dexterity", "Constitution", "Intelligence", "Wisdom", "Charisma"] }, "spells_known": { "type": "array", "description": "Spells the NPC knows innately (spontaneous casters).", "items": { "type": "string" } }, "spells_prepared": { "type": "array", "description": "Spells the NPC has prepared.", "items": { "type": "string" } }, "spell_slots_total": { "type": "object", "description": "Total spell slots per level (1\u20139) per day.", "properties": { "1": { "type": "integer" }, "2": { "type": "integer" }, "3": { "type": "integer" }, "4": { "type": "integer" }, "5": { "type": "integer" }, "6": { "type": "integer" }, "7": { "type": "integer" }, "8": { "type": "integer" }, "9": { "type": "integer" } } }, "spell_slots_usable": { "type": "object", "description": "Remaining spell slots per level (1\u20139). Defaults to spell_slots_total on creation.", "properties": { "1": { "type": "integer" }, "2": { "type": "integer" }, "3": { "type": "integer" }, "4": { "type": "integer" }, "5": { "type": "integer" }, "6": { "type": "integer" }, "7": { "type": "integer" }, "8": { "type": "integer" }, "9": { "type": "integer" } } }, "senses": { "type": "string", "description": "Special senses (e.g., 'Darkvision 60 ft., Passive Perception 15')." }, "languages": { "type": "array", "description": "Languages spoken by the NPC.", "items": { "type": "string", "enum": ["Common", "Common Sign Language", "Dwarvish", "Elvish", "Giant", "Gnomish", "Goblin", "Halfling", "Orcish", "Abyssal", "Celestial", "Deep Speech", "Draconic", "Druidic", "Infernal", "Primordial", "Aquan", "Auran", "Ignan", "Terran", "Sylvan", "Thieves' Cant", "Undercommon"] } }, "damage_resistances": { "type": "array", "description": "Damage types the NPC is resistant to (takes half damage).", "items": { "type": "string", "enum": ["Acid", "Bludgeoning", "Cold", "Fire", "Force", "Lightning", "Necrotic", "Piercing", "Poison", "Psychic", "Radiant", "Slashing", "Thunder", "Nonmagical Bludgeoning", "Nonmagical Piercing", "Nonmagical Slashing"] } }, "damage_immunities": { "type": "array", "description": "Damage types the NPC is immune to (takes no damage).", "items": { "type": "string", "enum": ["Acid", "Bludgeoning", "Cold", "Fire", "Force", "Lightning", "Necrotic", "Piercing", "Poison", "Psychic", "Radiant", "Slashing", "Thunder", "Nonmagical Bludgeoning", "Nonmagical Piercing", "Nonmagical Slashing"] } }, "damage_vulnerabilities": { "type": "array", "description": "Damage types the NPC is vulnerable to (takes double damage).", "items": { "type": "string", "enum": ["Acid", "Bludgeoning", "Cold", "Fire", "Force", "Lightning", "Necrotic", "Piercing", "Poison", "Psychic", "Radiant", "Slashing", "Thunder"] } }, "condition_immunities": { "type": "array", "description": "Conditions the NPC is immune to.", "items": { "type": "string", "enum": ["Blinded", "Charmed", "Deafened", "Exhaustion", "Frightened", "Grappled", "Incapacitated", "Invisible", "Paralyzed", "Petrified", "Poisoned", "Prone", "Restrained", "Stunned", "Unconscious"] } }, "conditions": { "type": "array", "description": "Currently active conditions on the NPC. Standard conditions: Blinded, Charmed, Deafened, Frightened, Grappled, Incapacitated, Invisible, Paralyzed, Petrified, Poisoned, Prone, Restrained, Stunned, Unconscious. Exhaustion is tracked with its level (e.g. 'Exhaustion 1'). Prefer apply_condition and remove_condition for incremental updates.", "items": { "type": "string" } }, "traits": { "type": "array", "description": "Passive special traits (e.g., Pack Tactics, Undead Fortitude).", "items": { "type": "object", "properties": { "name": { "type": "string" }, "description": { "type": "string" } }, "required": ["name", "description"] } }, "actions": { "type": "array", "description": "Actions the NPC can take on its turn.", "items": { "type": "object", "properties": { "name": { "type": "string" }, "description": { "type": "string" } }, "required": ["name", "description"] } }, "bonus_actions": { "type": "array", "description": "Bonus actions available to the NPC.", "items": { "type": "object", "properties": { "name": { "type": "string" }, "description": { "type": "string" } }, "required": ["name", "description"] } }, "reactions": { "type": "array", "description": "Reactions available to the NPC.", "items": { "type": "object", "properties": { "name": { "type": "string" }, "description": { "type": "string" } }, "required": ["name", "description"] } }, "legendary_resistances": { "type": "integer", "description": "Number of Legendary Resistances per day." }, "legendary_actions": { "type": "array", "description": "Legendary actions available to the NPC.", "items": { "type": "object", "properties": { "name": { "type": "string" }, "description": { "type": "string" } }, "required": ["name", "description"] } }, "lair_actions": { "type": "array", "description": "Lair actions available to the NPC when in its lair.", "items": { "type": "object", "properties": { "name": { "type": "string" }, "description": { "type": "string" } }, "required": ["name", "description"] } }, "equipment": { "type": "array", "description": "Equipment and items carried by the NPC.", "items": { "type": "string" } }, "notes": { "type": "string", "description": "Freeform DM notes about the NPC." }, "gold": { "type": "number", "description": "The NPC's wealth in gold pieces (GP).", "minimum": 0 } } },
    handler: upsert_npc
  },
  {
    name: "dnd5e24_use_reaction",
    description: "Marks a combatant's reaction as spent for the current round. Use when a combatant takes an opportunity attack, casts Shield, Counterspell, Hellish Rebuke, or any other reaction. The reaction recharges automatically at the start of the combatant's next turn (handled by advance_turn). Returns an error if the reaction was already used this round.",
    inputSchema: { "type": "object", "required": ["game", "entity_type", "entity"], "properties": { "game": { "type": "string", "description": "The slug of the game." }, "entity_type": { "type": "string", "enum": ["character", "npc"], "description": "Whether the combatant is a player character or NPC." }, "entity": { "type": "string", "description": "The slug of the combatant (must match their slug in the combat turn order)." } } },
    handler: use_reaction
  },
  {
    name: "dnd5e24_use_resource",
    description: "Spends or restores uses of a named resource pool on a character or NPC (e.g. Rage, Ki, Channel Divinity, Action Surge). Use action 'use' when the resource is spent and 'restore' when recovering uses outside of a rest (e.g. a feature that grants a resource back).",
    inputSchema: { "type": "object", "required": ["game", "entity_type", "entity", "resource_name"], "properties": { "game": { "type": "string", "description": "The slug of the game." }, "entity_type": { "type": "string", "description": "Whether the entity is a player character or NPC.", "enum": ["character", "npc"] }, "entity": { "type": "string", "description": "Slug or UUID of the character or NPC." }, "resource_name": { "type": "string", "description": "Name of the resource to spend or restore (must match an entry in the entity's resources array exactly)." }, "amount": { "type": "integer", "description": "Number of uses to spend or restore. Defaults to 1.", "minimum": 1, "default": 1 }, "action": { "type": "string", "description": "Whether to spend ('use') or recover ('restore') uses. Defaults to 'use'.", "enum": ["use", "restore"], "default": "use" } } },
    handler: use_resource
  },
  {
    name: "dnd5e24_use_spell_slot",
    description: "Expends one spell slot of the given level for a character. Decrements spell_slots_usable by 1 for the specified level. Returns an error if no slots of that level remain.",
    inputSchema: { "type": "object", "required": ["game", "character", "level"], "properties": { "game": { "type": "string", "description": "The slug of the game." }, "character": { "type": "string", "description": "The slug or name of the character expending the slot." }, "level": { "type": "integer", "description": "The spell slot level (1\u20139) to expend.", "minimum": 1, "maximum": 9 } } },
    handler: use_spell_slot
  }
];
var toolMap = new Map(tools.map((t) => [t.name, t]));
var resources = [
  {
    "uri": "dnd://context/a2f1e3b4-7c8d-4e9f-a0b1-c2d3e4f5a6b7",
    "name": "D&D Plugin Usage Instructions",
    "mimeType": "text/markdown",
    "text": "## Key Workflows\n\n- **Starting or resuming a game**: Call `dnd5e24_list_memories` with the game slug before narrating anything \u2014 this loads accumulated lore, NPC decisions, and world state from previous sessions from a Supabase database. Then call `dnd5e24_list_characters` and `dnd5e24_list_npcs` to restore the roster.\n- **Creating a new game**: Call `dnd5e24_create_game` first. All other functions require a `game` slug \u2014 pass the game's slug on every subsequent call.\n- **Recording memories**: Use `dnd5e24_upsert_memory` to save any lore, NPC decisions, plot twists, or world facts that should persist across sessions. Use `dnd5e24_delete_memory` to remove outdated entries.\n\n## Error Handling\n\n- Schema migrations run automatically inside every function. If a function still fails with a schema error, report it to the user rather than retrying indefinitely.\n- If an upsert function reports a duplicate slug conflict, ask the user to choose a different slug.\n\n## Dungeon Master Guidelines\n\n- Stay in character as a D&D 5e24 Dungeon Master. Narrate outcomes dramatically and engagingly.\n- Pass `damage_type` to `dnd5e24_apply_damage` whenever known \u2014 resistances, immunities, and vulnerabilities are applied automatically server-side when a type is provided.\n- When multiple entities are affected by an action (e.g., area of effect), call `dnd5e24_apply_damage` once per entity.\n- After any significant plot development \u2014 a betrayal, a discovery, a character death, a major decision \u2014 call `dnd5e24_upsert_memory` proactively to preserve it.\n\n## Damage Resolution\n\nWhen you call `apply_damage` with a `damage_type`, the server automatically checks the target's stored resistances, immunities, and vulnerabilities and applies the correct multiplier:\n\n- **Immune**: 0 damage\n- **Resistant**: half damage (round down)\n- **Vulnerable**: double damage\n\nTemporary HP absorbs damage after the multiplier is applied. You only need to narrate the outcome \u2014 never halve or double the dice roll yourself before calling the tool.\n"
  }
];
var resourceMap = new Map(resources.map((r) => [r.uri, r]));
var userSettings = {
  externalDbUrl: process.env.SUPABASE_URL ?? "",
  externalDbKey: process.env.SUPABASE_KEY ?? ""
};
var _reqId = 0;
var _pending = /* @__PURE__ */ new Map();
function sendRequest(method, params) {
  return new Promise((resolve, reject) => {
    const id = "__srv" + ++_reqId;
    _pending.set(id, { resolve, reject });
    send({ jsonrpc: "2.0", id, method, params });
  });
}
async function routeMessage(msg) {
  if (msg.id !== void 0 && msg.method === void 0 && _pending.has(String(msg.id))) {
    const p = _pending.get(String(msg.id));
    _pending.delete(String(msg.id));
    if (msg.error) p.reject(new Error(msg.error.message));
    else p.resolve(msg.result);
    return;
  }
  handleMessage(msg);
}
function send(obj) {
  process.stdout.write(JSON.stringify(obj) + "\n");
}
function respond(id, result) {
  send({ jsonrpc: "2.0", id, result });
}
function respondError(id, code, message) {
  send({ jsonrpc: "2.0", id, error: { code, message } });
}
async function handleMessage(msg) {
  const { id, method, params } = msg;
  if (method === "initialize") {
    if (params?.capabilities?.elicitation) {
      setElicitBackend(async (message) => {
        try {
          const res = await sendRequest("elicitation/create", {
            message,
            requestedSchema: {
              type: "object",
              properties: { value: { type: "string", title: "Your answer" } },
              required: ["value"]
            }
          });
          if (res?.action === "accept") return res.content?.value ?? null;
          return null;
        } catch {
          return null;
        }
      });
    }
    respond(id, {
      protocolVersion: "2024-11-05",
      capabilities: { tools: {}, resources: {} },
      serverInfo: { name: "dnd-plugin", version: "1.0.0" }
    });
  } else if (method === "notifications/initialized") {
  } else if (method === "tools/list") {
    respond(id, {
      tools: tools.map(({ name, description, inputSchema }) => ({ name, description, inputSchema }))
    });
  } else if (method === "tools/call") {
    const tool = toolMap.get(params?.name);
    if (!tool) {
      respondError(id, -32602, `Unknown tool: ${params?.name}`);
      return;
    }
    try {
      const result = await tool.handler(params?.arguments ?? {}, userSettings);
      respond(id, { content: [{ type: "text", text: String(result) }] });
    } catch (err) {
      respond(id, { content: [{ type: "text", text: `Error: ${err.message}` }], isError: true });
    }
  } else if (method === "resources/list") {
    respond(id, {
      resources: resources.map(({ uri, name, mimeType }) => ({ uri, name, mimeType }))
    });
  } else if (method === "resources/read") {
    const resource = resourceMap.get(params?.uri);
    if (!resource) {
      respondError(id, -32602, `Unknown resource: ${params?.uri}`);
      return;
    }
    respond(id, {
      contents: [{ uri: resource.uri, mimeType: resource.mimeType, text: resource.text }]
    });
  } else if (id !== void 0) {
    respondError(id, -32601, `Method not found: ${method}`);
  }
}
var buf = "";
process.stdin.setEncoding("utf-8");
process.stdin.on("data", (chunk) => {
  buf += chunk;
  let nl;
  while ((nl = buf.indexOf("\n")) !== -1) {
    const line = buf.slice(0, nl).trim();
    buf = buf.slice(nl + 1);
    if (line) {
      try {
        routeMessage(JSON.parse(line));
      } catch {
      }
    }
  }
});
