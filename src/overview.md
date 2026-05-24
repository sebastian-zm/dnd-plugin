## D&D Dungeon Master Assistant

This plugin transforms your AI assistant into a Dungeon Master for Dungeons & Dragons 2024 Revision.

### Features
- **Game Management**: Create and persist multiple D&D games. Each game is identified by a slug used in every other call.
- **Characters & NPCs**: Add player characters and NPCs (monsters, allies, etc.) scoped to a game. Use `upsert_character` / `upsert_npc` for both creation and updates — if the slug already exists, only the fields you pass are changed. Slugs are auto-generated from the name if you omit them.
- **HP Tracking**: Track current, max, and temporary HP for any character or NPC.
- **Damage and Healing**: Apply damage (with automatic resistance/immunity/vulnerability resolution) or healing (including temporary HP) to any combatant. Always pass the raw dice roll — the server applies the correct multiplier.
- **Memories**: Store world lore, NPC decisions, and plot points as named memories scoped to a game.
- **Inventory**: Give or remove items from characters and NPCs.

### Damage Resolution

When you call `apply_damage` with a `damage_type`, the server automatically checks the target's stored resistances, immunities, and vulnerabilities and applies the correct multiplier:

- **Immune**: 0 damage
- **Resistant**: half damage (round down)
- **Vulnerable**: double damage

Temporary HP absorbs damage after the multiplier is applied. You only need to narrate the outcome — never halve or double the dice roll yourself before calling the tool.

---

### Database Setup (Required)

Game state is persisted in a [Supabase](https://supabase.com) PostgreSQL database. The free tier is sufficient.

#### 1. Create a Supabase project

Sign up at [supabase.com](https://supabase.com) and create a new project. Note your **Project URL** and **service_role key** from **Project Settings → API**.

> Use the `service_role` key, not the `anon` key. This key is never sent to any third party — it is stored locally in TypingMind and used only to talk directly to your own Supabase project.

#### 2. Create the migration helper function

The plugin manages its own schema automatically. Supabase's REST API does not support DDL statements (like `CREATE TABLE`), so you need to create a small helper function in your database once.

Open the **SQL Editor** in your Supabase dashboard and run:

```sql
CREATE OR REPLACE FUNCTION execute_migration_sql(sql text, is_query boolean DEFAULT false)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  result json;
BEGIN
  IF is_query THEN
    EXECUTE format('SELECT json_agg(row_to_json(t)) FROM (%s) t', sql) INTO result;
    RETURN COALESCE(result, '[]'::json);
  ELSE
    EXECUTE sql;
    RETURN '[]'::json;
  END IF;
END;
$$;
```

This function lets the plugin create tables without going through PostgREST's schema cache. It is only callable with your `service_role` key.

#### 3. Configure the plugin

In TypingMind, open the plugin settings and fill in:

| Setting | Where to find it |
|---|---|
| **External Supabase URL** | Project Settings → API → Project URL |
| **External Supabase API Key** | Project Settings → API → `service_role` key |

The plugin runs all required database migrations automatically on first use. No manual migration step is needed.
