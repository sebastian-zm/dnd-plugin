import fs from 'fs/promises';
import path from 'path';
import * as esbuild from 'esbuild';

const SRC_DIR = 'src';
const DIST_DIR = 'dist';
const FUNCTIONS_DIR = path.join(SRC_DIR, 'functions');

async function bundleFunction(name) {
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
      js: `function ${name}(params, userSettings){return __plugin.default(params, userSettings)}`,
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

    const functionFiles = await fs.readdir(FUNCTIONS_DIR);
    const functionNames = [...new Set(functionFiles.map(f => f.split('.')[0]))];

    const pluginFunctions = await Promise.all(
      functionNames.map(async (name) => {
        const specPath = path.join(FUNCTIONS_DIR, `${name}.spec.json`);
        const spec = JSON.parse(await fs.readFile(specPath, 'utf-8'));
        const code = await bundleFunction(name);

        return {
          id: `dnd-${name}-${Date.now()}`,
          name,
          openaiSpec: spec,
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
