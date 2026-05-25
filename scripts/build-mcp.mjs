import fs from 'fs/promises';
import path from 'path';
import * as esbuild from 'esbuild';

const SRC_DIR = 'src';
const DIST_DIR = 'dist';
const FUNCTIONS_DIR = path.join(SRC_DIR, 'functions');
const CONTEXT_DIR = path.join(SRC_DIR, 'context');
const PREFIX = 'dnd5e24_';

async function buildMcp() {
  await fs.mkdir(DIST_DIR, { recursive: true });

  const functionFiles = await fs.readdir(FUNCTIONS_DIR);
  const jsNames = new Set(
    functionFiles.filter(f => f.endsWith('.js')).map(f => f.replace(/\.js$/, ''))
  );
  const functionNames = functionFiles
    .filter(f => f.endsWith('.spec.json'))
    .map(f => f.replace(/\.spec\.json$/, ''))
    .filter(n => jsNames.has(n));

  const specs = await Promise.all(
    functionNames.map(async name => {
      const specPath = path.join(FUNCTIONS_DIR, `${name}.spec.json`);
      return JSON.parse(await fs.readFile(specPath, 'utf-8'));
    })
  );

  const pluginConfig = JSON.parse(await fs.readFile(path.join(SRC_DIR, 'main.json'), 'utf-8'));
  const resources = await Promise.all(
    (pluginConfig.dynamicContextEndpoints ?? [])
      .filter(ep => ep.source === 'static' && ep.staticContentFile)
      .map(async ep => {
        const text = await fs.readFile(path.join(CONTEXT_DIR, ep.staticContentFile), 'utf-8');
        return { uri: `dnd://context/${ep.id}`, name: ep.name, mimeType: 'text/markdown', text };
      })
  );

  const imports = functionNames
    .map((name, i) => `import fn_${i} from './${FUNCTIONS_DIR.replace(/\\/g, '/')}/${name}.js';`)
    .join('\n');

  const toolsArray = functionNames
    .map((name, i) => {
      const spec = specs[i];
      return `  {
    name: ${JSON.stringify(`${PREFIX}${name}`)},
    description: ${JSON.stringify(spec.description)},
    inputSchema: ${JSON.stringify(spec.parameters)},
    handler: fn_${i},
  }`;
    })
    .join(',\n');

  const resourcesLiteral = JSON.stringify(resources, null, 2);

  const entryCode = `#!/usr/bin/env node
${imports}
import { setElicitBackend } from './src/lib/elicit.js';

const tools = [
${toolsArray}
];
const toolMap = new Map(tools.map(t => [t.name, t]));

const resources = ${resourcesLiteral};
const resourceMap = new Map(resources.map(r => [r.uri, r]));

const userSettings = {
  externalDbUrl: process.env.SUPABASE_URL ?? '',
  externalDbKey: process.env.SUPABASE_KEY ?? '',
};

let _reqId = 0;
const _pending = new Map();

function sendRequest(method, params) {
  return new Promise((resolve, reject) => {
    const id = '__srv' + (++_reqId);
    _pending.set(id, { resolve, reject });
    send({ jsonrpc: '2.0', id, method, params });
  });
}

async function routeMessage(msg) {
  if (msg.id !== undefined && msg.method === undefined && _pending.has(String(msg.id))) {
    const p = _pending.get(String(msg.id));
    _pending.delete(String(msg.id));
    if (msg.error) p.reject(new Error(msg.error.message));
    else p.resolve(msg.result);
    return;
  }
  handleMessage(msg);
}

function send(obj) {
  process.stdout.write(JSON.stringify(obj) + '\\n');
}

function respond(id, result) {
  send({ jsonrpc: '2.0', id, result });
}

function respondError(id, code, message) {
  send({ jsonrpc: '2.0', id, error: { code, message } });
}

async function handleMessage(msg) {
  const { id, method, params } = msg;

  if (method === 'initialize') {
    if (params?.capabilities?.elicitation) {
      setElicitBackend(async (message) => {
        try {
          const res = await sendRequest('elicitation/create', {
            message,
            requestedSchema: {
              type: 'object',
              properties: { value: { type: 'string', title: 'Your answer' } },
              required: ['value'],
            },
          });
          if (res?.action === 'accept') return res.content?.value ?? null;
          return null;
        } catch { return null; }
      });
    }
    respond(id, {
      protocolVersion: '2024-11-05',
      capabilities: { tools: {}, resources: {} },
      serverInfo: { name: 'dnd-plugin', version: '1.0.0' },
    });
  } else if (method === 'notifications/initialized') {
    // notification — no response
  } else if (method === 'tools/list') {
    respond(id, {
      tools: tools.map(({ name, description, inputSchema }) => ({ name, description, inputSchema })),
    });
  } else if (method === 'tools/call') {
    const tool = toolMap.get(params?.name);
    if (!tool) {
      respondError(id, -32602, \`Unknown tool: \${params?.name}\`);
      return;
    }
    try {
      const result = await tool.handler(params?.arguments ?? {}, userSettings);
      respond(id, { content: [{ type: 'text', text: String(result) }] });
    } catch (err) {
      respond(id, { content: [{ type: 'text', text: \`Error: \${err.message}\` }], isError: true });
    }
  } else if (method === 'resources/list') {
    respond(id, {
      resources: resources.map(({ uri, name, mimeType }) => ({ uri, name, mimeType })),
    });
  } else if (method === 'resources/read') {
    const resource = resourceMap.get(params?.uri);
    if (!resource) {
      respondError(id, -32602, \`Unknown resource: \${params?.uri}\`);
      return;
    }
    respond(id, {
      contents: [{ uri: resource.uri, mimeType: resource.mimeType, text: resource.text }],
    });
  } else if (id !== undefined) {
    respondError(id, -32601, \`Method not found: \${method}\`);
  }
}

let buf = '';
process.stdin.setEncoding('utf-8');
process.stdin.on('data', chunk => {
  buf += chunk;
  let nl;
  while ((nl = buf.indexOf('\\n')) !== -1) {
    const line = buf.slice(0, nl).trim();
    buf = buf.slice(nl + 1);
    if (line) {
      try {
        routeMessage(JSON.parse(line));
      } catch {
        // ignore unparseable lines
      }
    }
  }
});
`;

  await esbuild.build({
    stdin: {
      contents: entryCode,
      resolveDir: process.cwd(),
    },
    bundle: true,
    write: true,
    outfile: path.join(DIST_DIR, 'mcp-server.mjs'),
    format: 'esm',
    platform: 'node',
    target: 'node18',
  });

  console.log('MCP server built successfully!');
}

buildMcp().catch(err => {
  console.error('Error building MCP server:', err);
  process.exit(1);
});
