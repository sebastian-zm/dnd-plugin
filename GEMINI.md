# Project Overview

This project is a "TypingMind plugin" that acts as a Dungeon Master for Dungeons & Dragons 5th Edition. It allows an AI assistant to manage D&D games, including game and character management, HP tracking, and applying damage or healing.

The plugin is configured through `src/main.json` and its capabilities are described in `src/overview.md`. The core logic of the plugin is implemented as a set of "plugin functions" located in the `src/functions` directory. Each function consists of a `.spec.json` file defining its interface and a `.js` file for its implementation.

An optional external database can be configured to persist game state across sessions.

# Building and Running

To build the plugin, run the following command:

```bash
npm run build
```

This will generate the final plugin file at `dist/dnd-plugin.json`. This file is a combination of the main configuration, overview documentation, and all the plugin functions.

There are no specific instructions for running the plugin, but it's likely intended to be loaded into a platform that supports the "TypingMind plugin" format.

# Development Conventions

## Adding New Functions

To add a new function to the plugin, you need to create two files in the `src/functions` directory:

1.  `<function-name>.spec.json`: A JSON file that defines the function's name and its OpenAI function specification.
2.  `<function-name>.js`: A JavaScript file that contains the implementation of the function.

After adding the files, you need to rebuild the plugin using `npm run build` to include the new function in the final `dist/dnd-plugin.json` file.

## Code Style

The project uses a standard JavaScript style, but there are no specific linting or formatting rules defined. It's recommended to follow the existing code style.

## Testing

There are no tests in the project. It's recommended to add a testing framework to ensure the quality of the plugin's functions.
