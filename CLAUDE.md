# Project Overview

This project is a TypingMind plugin that acts as a Dungeon Master for Dungeons & Dragons 2024 Revision. It allows an AI assistant to manage D&D 5.5e games, including game and character management, HP tracking, and applying damage or healing.

The plugin is configured through `src/main.json` and its capabilities are described in `src/overview.md`. The core logic of the plugin is implemented as a set of "plugin functions" located in the `src/functions` directory. Each function consists of a `.spec.json` file defining its interface and a `.js` file for its implementation.

Game state is persisted in a Supabase (PostgreSQL) database configured by the user via plugin settings.

# Building and Running

On a fresh clone, install dependencies first:

```bash
npm install
```

Then build the plugin:

```bash
npm run build
```

This will generate the final plugin file at `dist/dnd-plugin.json`. This file is a combination of the main configuration, overview documentation, and all the plugin functions.

The plugin is intended to be loaded manually into TypingMind for execution.

## Additional Build Targets

### MCP Server (`build:mcp`)

```bash
npm run build:mcp
```

Produces `dist/mcp-server.mjs`: a self-contained Node.js MCP server that exposes all plugin functions as MCP tools over JSON-RPC via stdin/stdout. Supabase credentials are read from the `SUPABASE_URL` and `SUPABASE_KEY` environment variables. Use this to run the plugin locally or integrate it with any MCP-compatible host (e.g. Claude Desktop via a manual `mcpServers` config entry).

### Claude Desktop Extension Bundle (`build:mcpb`)

```bash
npm run build:mcpb
```

Produces `dist/dnd-plugin.mcpb`: a zip archive (Claude Desktop extension format) containing `src/manifest.json` and `src/assets/icon.svg`. The manifest configures Claude Desktop to run `npx github:sebastian-zm/dnd-plugin` on launch, so the extension always fetches the latest published version from GitHub. Prompts the user for their Supabase URL and service-role key at install time.

# TypingMind Plugin Reference

Documentation on the TypingMind plugin format, JSON schema, function signatures, output types, permissions, and deployment is in `docs/typingmind_plugins/`:

- `docs/typingmind_plugins/json_schema.md` — Full JSON schema for the plugin file format.
- `docs/typingmind_plugins/plugin_concepts.md` — How plugins work: execution model, implementation types, naming rules, output types, permissions.

# Data Layer

## Supabase Store

All persistence goes through `src/lib/supabase_store.js`, which wraps the Supabase REST API (PostgREST). It exposes six methods: `insert`, `upsert`, `get`, `list`, `patch`, and `delete`. `get` resolves by UUID or by slug (optionally scoped by `game_slug`). `patch` automatically bumps `updated_at`. Errors from Supabase are thrown as structured `Error` objects with a `.code` property containing the PostgreSQL error code (e.g. `42P01` for missing table, `42703` for missing column, `23505` for unique-constraint violation).

## Migrations

Database schema is managed through an embedded migration system in `src/lib/migrations.js`. Migrations are defined as an ordered array of `{ version, name, sql }` objects directly in that file. Applied migrations are tracked in a `schema_migrations` table in the database.

**Migrations run automatically**: every function calls `ensureMigrations()` at startup, which applies any pending migrations before touching the database. There is no separate `run_migrations` tool — the LLM never needs to trigger migrations manually.

**Running migrations** calls the `execute_migration_sql` PostgreSQL function (created by the user during setup — see `overview.md`) via the project's PostgREST endpoint using the `service_role` key. The function runs arbitrary SQL with `SECURITY DEFINER` so DDL works; only the `service_role` key can invoke it. The Management API is not used.

**Adding a new migration**: append a new entry to the `MIGRATIONS` array in `migrations.js`. Use a UTC timestamp as the version to ensure correct ordering. **Always run the following command first to get the current UTC timestamp before writing the migration version:**

```bash
date -u +%Y%m%d%H%M%S
```

The SQL must be idempotent (use `IF NOT EXISTS`, `IF EXISTS`, etc.) since the migration runner only checks the version, not the content.

**Keeping migrations in sync with the stat-block objects**: when adding or renaming fields on the NPC or character objects (`upsert_npc.js` / `upsert_npc.spec.json` / `upsert_character.js` / `upsert_character.spec.json`), add a corresponding `ALTER TABLE` migration so the schema stays consistent. Never modify the SQL of an already-applied migration — add a new one instead.

# Development Conventions

## Adding New Functions

To add a new function to the plugin, you need to create two files in the `src/functions` directory:

1.  `<function-name>.spec.json`: A JSON file that defines the function's name and its OpenAI function specification.
2.  `<function-name>.js`: A JavaScript file that contains the implementation of the function.

After adding the files, you need to rebuild the plugin using `npm run build` to include the new function in the final `dist/dnd-plugin.json` file.

