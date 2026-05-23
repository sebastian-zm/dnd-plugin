## D&D Dungeon Master Assistant

This plugin transforms your AI assistant into a Dungeon Master for Dungeons & Dragons 2024 Revision.

### Features
- **Game Management**: Create, manage, and save multiple D&D games.
- **Character Management**: Add and control characters within your games.
- **HP Tracking**: Easily track character hit points.
- **Damage and Healing**: Apply damage or healing to characters.

---

### Database Setup (Required)

Game state is persisted in a [Supabase](https://supabase.com) PostgreSQL database. The free tier is sufficient.

#### 1. Create a Supabase project

Sign up at [supabase.com](https://supabase.com) and create a new project. Note your **Project URL** and **service_role key** from **Project Settings → API**.

> Use the `service_role` key, not the `anon` key. This key is never sent to any third party — it is stored locally in TypingMind and used only to talk directly to your own Supabase project.

#### 2. Create the migration helper function

The plugin manages its own schema using migrations, which run directly from your browser. Supabase's REST API does not support DDL statements (like `CREATE TABLE`), so you need to create a small helper function in your database once.

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

This function lets the plugin create tables and query them without going through PostgREST's schema cache. It is only callable with your `service_role` key.

#### 3. Configure the plugin

In TypingMind, open the plugin settings and fill in:

| Setting | Where to find it |
|---|---|
| **External Supabase URL** | Project Settings → API → Project URL |
| **External Supabase API Key** | Project Settings → API → `service_role` key |

#### 4. Run migrations

The first time you use the plugin, ask the assistant to run migrations. It will set up all required tables automatically. You only need to do this once (and again whenever the plugin is updated with new features).
