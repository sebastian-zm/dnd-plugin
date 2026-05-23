# Project Overview

This project is a TypingMind plugin that acts as a Dungeon Master for Dungeons & Dragons 2024 Revision. It allows an AI assistant to manage D&D 5.5e games, including game and character management, HP tracking, and applying damage or healing.

The plugin is configured through `src/main.json` and its capabilities are described in `src/overview.md`. The core logic of the plugin is implemented as a set of "plugin functions" located in the `src/functions` directory. Each function consists of a `.spec.json` file defining its interface and a `.js` file for its implementation.

An optional external database can be configured to persist game state across sessions.

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

# TypingMind Plugin Reference

Documentation on the TypingMind plugin format, JSON schema, function signatures, output types, permissions, and deployment is in `docs/typingmind_plugins/`:

- `docs/typingmind_plugins/json_schema.md` — Full JSON schema for the plugin file format.
- `docs/typingmind_plugins/plugin_concepts.md` — How plugins work: execution model, implementation types, naming rules, output types, permissions.

# Development Conventions

## Adding New Functions

To add a new function to the plugin, you need to create two files in the `src/functions` directory:

1.  `<function-name>.spec.json`: A JSON file that defines the function's name and its OpenAI function specification.
2.  `<function-name>.js`: A JavaScript file that contains the implementation of the function.

After adding the files, you need to rebuild the plugin using `npm run build` to include the new function in the final `dist/dnd-plugin.json` file.

