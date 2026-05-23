# TypingMind Plugin JSON Schema

Source: https://docs.typingmind.com/plugins/typingmind-plugin-json-schema

## Root Plugin Object

### Required Fields

| Field | Type | Description |
|---|---|---|
| `id` | string (UUID) | Unique identifier |
| `uuid` | string (UUID) | Duplicate of `id` |
| `title` | string | Plugin display name |
| `iconURL` | string (URL) | Plugin icon image |
| `createdAt` | string (ISO 8601) | Creation timestamp |
| `githubURL` | string (URL) | Source repository link |
| `overviewMarkdown` | string | Markdown description shown to the AI |
| `authenticationType` | string | e.g. `AUTH_TYPE_NONE` |
| `pluginFunctions` | array | Function definitions (see below) |

### Optional Fields

| Field | Type | Description |
|---|---|---|
| `sourceUUID` | string \| null | Reference to source plugin |
| `oauthConfig` | object \| null | OAuth 2.0 config (see below) |
| `userSettings` | array | User-configurable fields (see below) |
| `dynamicContextEndpoints` | array | Context data injected into the system prompt |
| `permissions` | array of strings | e.g. `read_user_message`, `previousRunOutput` |

---

## User Settings

Array of objects. Each defines an input field shown to the user when they install the plugin.

```json
{
  "name": "apiKey",
  "label": "API Key",
  "description": "Your API key from the service dashboard.",
  "type": "password",
  "required": true,
  "defaultValue": ""
}
```

| Field | Type | Notes |
|---|---|---|
| `name` | string | Identifier used for variable substitution: `{apiKey}` |
| `label` | string | UI display text |
| `description` | string | Helper text shown to user |
| `type` | string | `text`, `password`, `email`, `number`, `enum` |
| `required` | boolean | Whether the field must be filled |
| `defaultValue` | string | Optional fallback value |

---

## Plugin Functions

Each entry in the `pluginFunctions` array:

| Field | Type | Notes |
|---|---|---|
| `id` | string (UUID) | Unique per function |
| `name` | string | Must match the function name in `openaiSpec` and implementation |
| `implementationType` | enum | `"javascript"` \| `"http"` \| `"mcp"` |
| `openaiSpec` | object | OpenAI function calling spec |
| `outputType` | enum | `"respond_to_ai"` \| `"render_html"` |
| `code` | string | *(JavaScript only)* The function source code as a string |
| `httpAction` | object | *(HTTP only)* HTTP action config (see below) |
| `serverConfig` | object | *(MCP only)* MCP server config |

### `outputType` Values

- `respond_to_ai` — Output is passed back to the AI model for further processing.
- `render_html` — Output is rendered directly in the chat as HTML (for charts, interactive UI, etc.).

### `openaiSpec` Schema

```json
{
  "name": "create_npc",
  "description": "Creates a new NPC and adds it to the game.",
  "parameters": {
    "type": "object",
    "required": ["name"],
    "properties": {
      "name": {
        "type": "string",
        "description": "The name of the NPC."
      },
      "cr": {
        "type": "number",
        "description": "Challenge rating.",
        "enum": [0, 0.125, 0.25, 0.5, 1, 2, 3, 4, 5]
      },
      "tags": {
        "type": "array",
        "description": "Descriptive tags.",
        "items": { "type": "string" }
      }
    }
  }
}
```

### HTTP Action Config

```json
{
  "httpAction": {
    "id": "UUID",
    "url": "https://api.example.com/endpoint?key={apiKey}",
    "method": "GET",
    "hasBody": false,
    "hasHeaders": false,
    "requestBody": "",
    "requestHeaders": "",
    "requestBodyFormat": "json"
  }
}
```

Variable substitution in URLs and bodies: `{userSettingName}`, `{paramName}`, `{OAUTH_PLUGIN_ACCESS_TOKEN}`, `{chatID}`, `{USER_ID}`.

Post-processing supported via JMESPath transforms or Handlebars templates.

### MCP Server Config

```json
{
  "serverConfig": {
    "mcpServers": {
      "myServer": {
        "command": "node",
        "args": ["server.js"]
      }
    }
  }
}
```

---

## OAuth Configuration

```json
{
  "oauthConfig": {
    "authorizationURL": "https://accounts.google.com/o/oauth2/auth",
    "tokenURL": "https://oauth2.googleapis.com/token",
    "scopes": "https://www.googleapis.com/auth/calendar",
    "accessType": "offline",
    "prompt": "consent",
    "contentType": "urlencoded"
  }
}
```

Set `accessType: "offline"` and `prompt: "consent"` to get a refresh token so users don't have to re-authenticate when the access token expires.

---

## Dynamic Context Endpoints

Inject additional context into the AI's system prompt, either from a static string or a live HTTP endpoint.

```json
{
  "id": "UUID",
  "name": "Game State",
  "source": "http",
  "url": "https://api.example.com/context",
  "method": "GET",
  "hasBody": false,
  "hasHeaders": false,
  "requestBody": "",
  "requestHeaders": "",
  "enableCache": true,
  "cacheDurationHours": 1,
  "cacheRefreshPolicy": "REFRESH_ALWAYS"
}
```

`source` can be `"static"` (use `staticContent` field) or `"http"`.
