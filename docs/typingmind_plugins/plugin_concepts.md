# TypingMind Plugin Concepts

Sources:
- https://docs.typingmind.com/plugins/build-a-typingmind-plugin
- https://docs.typingmind.com/plugins/server-side-vs.-client-side-plugin

## How Plugins Work

TypingMind plugins extend the AI using the OpenAI Function Calling API specification. When the AI decides to call a function, TypingMind executes the plugin implementation and feeds the result back (or renders it directly).

Supported models include Claude and Gemini in addition to GPT.

---

## Implementation Types

### JavaScript (client-side)
- Runs in a sandboxed iframe in the user's browser (`allow-scripts` only).
- No server component — no Node.js APIs, no filesystem, no native modules.
- External HTTP requests go from the user's browser, so target servers must support CORS.
- Suitable for: interactive visualisations, local processing, user-managed API keys.

### HTTP Action (server-side by default)
- TypingMind makes the HTTP request from its own infrastructure.
- API keys and credentials are never exposed to the user.
- Supports variable substitution, JMESPath transforms, and Handlebars templates for post-processing.

### MCP (Model Context Protocol)
- Integrates an MCP server as a plugin.

**A plugin cannot be both server-side and client-side at the same time.** If you need both, you must create two separate plugins.

---

## JavaScript Function Signature

```js
async function myFunctionName(params, userSettings, resources) {
  // params       — values from the openaiSpec parameters
  // userSettings — values from the plugin's userSettings config
  // resources    — additional context (see Permissions below)
}
```

- The function name must exactly match `openaiSpec.name`.
- Errors should be thrown as `throw new Error("message")`.
- Async is supported.

---

## Permissions

Declared in the root `permissions` array. Grants access to additional data via the `resources` parameter:

| Permission | What it provides |
|---|---|
| `read_user_message` | The latest user message and any attachments |
| `previousRunOutput` | The output of the plugin's own previous execution |

Default (no permissions declared): only `params` and `userSettings` are available.

---

## Output Types

| `outputType` | Behaviour |
|---|---|
| `respond_to_ai` | Result is passed to the AI model to interpret and reply |
| `render_html` | Result is rendered as HTML directly in chat (charts, interactive UI) |
| `render_markdown` | Result is rendered as GitHub-flavoured Markdown |
| TypingMind Cards | Special format; currently supports image cards (`type: "image"`) |

---

## User Settings

User Settings define configuration fields that users fill in when they install the plugin (e.g. API keys). Values are accessed via `userSettings.fieldName` in JavaScript, or via `{fieldName}` variable substitution in HTTP actions.

Supported `type` values: `text`, `password`, `email`, `number`, `enum`.

---

## Plugin Context (Dynamic Context)

Injects additional text into the AI's system prompt before each conversation turn. Can be:
- **Static** — a fixed string defined in the plugin JSON.
- **HTTP** — fetched live from an endpoint, with optional caching.

Useful for injecting live game state, user preferences, or reference data.

---

## Naming Constraints

- Function names must be **unique across all installed plugins** in a TypingMind workspace.
- The `openaiSpec.name`, the JavaScript function name, and the `pluginFunctions[].name` field must all **match exactly**.

---

## Deployment

Plugins can be shared as:
- An exported JSON file (loaded manually in TypingMind).
- A secret share link.
- A GitHub-hosted file (URL import).
