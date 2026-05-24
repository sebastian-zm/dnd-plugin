import fs from 'fs/promises';
import path from 'path';
import * as esbuild from 'esbuild';

const SRC_DIR = 'src';
const DIST_DIR = 'dist';
const FUNCTIONS_DIR = path.join(SRC_DIR, 'functions');
const CONTEXT_DIR = path.join(SRC_DIR, 'context');

const PREFIX = 'dnd5e24_';

async function bundleFunction(name, prefixedName) {
  const entry = path.join(FUNCTIONS_DIR, `${name}.js`);

  const result = await esbuild.build({
    entryPoints: [entry],
    bundle: true,
    write: false,
    format: 'iife',
    globalName: '__plugin',
    platform: 'browser',
    target: 'es2020',
    minify: true,
    footer: {
      js: `function ${prefixedName}(params, userSettings){return __plugin.default(params, userSettings)}`,
    },
  });

  return result.outputFiles[0].text;
}

async function build() {
  try {
    await fs.mkdir(DIST_DIR, { recursive: true });

    const pluginTemplate = JSON.parse(
      await fs.readFile(path.join(SRC_DIR, 'main.json'), 'utf-8')
    );
    pluginTemplate.overviewMarkdown = await fs.readFile(
      path.join(SRC_DIR, 'overview.md'),
      'utf-8'
    );

    for (const endpoint of pluginTemplate.dynamicContextEndpoints ?? []) {
      if (endpoint.staticContentFile) {
        endpoint.staticContent = await fs.readFile(
          path.join(CONTEXT_DIR, endpoint.staticContentFile),
          'utf-8'
        );
        delete endpoint.staticContentFile;
      }
    }

    const functionFiles = await fs.readdir(FUNCTIONS_DIR);
    const jsNames = new Set(
      functionFiles.filter(f => f.endsWith('.js')).map(f => f.replace(/\.js$/, ''))
    );
    const functionNames = functionFiles
      .filter(f => f.endsWith('.spec.json'))
      .map(f => f.replace(/\.spec\.json$/, ''))
      .filter(n => jsNames.has(n));

    const pluginFunctions = await Promise.all(
      functionNames.map(async (name) => {
        const prefixedName = `${PREFIX}${name}`;
        const specPath = path.join(FUNCTIONS_DIR, `${name}.spec.json`);
        const spec = JSON.parse(await fs.readFile(specPath, 'utf-8'));
        const code = await bundleFunction(name, prefixedName);

        return {
          id: `dnd-${name}`,
          name: prefixedName,
          openaiSpec: { ...spec, name: prefixedName },
          code,
          implementationType: 'javascript',
          outputType: 'respond_to_ai',
        };
      })
    );

    pluginTemplate.pluginFunctions = pluginFunctions;

    await fs.writeFile(
      path.join(DIST_DIR, 'dnd-plugin.json'),
      JSON.stringify(pluginTemplate, null, 4)
    );
    console.log('Plugin built successfully!');
  } catch (error) {
    console.error('Error building plugin:', error);
    process.exit(1);
  }
}

build();
