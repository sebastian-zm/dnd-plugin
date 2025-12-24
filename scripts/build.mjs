import fs from 'fs/promises';
import path from 'path';

const SRC_DIR = 'src';
const DIST_DIR = 'dist';
const FUNCTIONS_DIR = path.join(SRC_DIR, 'functions');

async function build() {
  try {
    // Ensure dist directory exists
    await fs.mkdir(DIST_DIR, { recursive: true });

    // Read the main plugin template
    const pluginTemplate = JSON.parse(await fs.readFile(path.join(SRC_DIR, 'main.json'), 'utf-8'));

    // Read overview markdown
    pluginTemplate.overviewMarkdown = await fs.readFile(path.join(SRC_DIR, 'overview.md'), 'utf-8');

    // Read and process plugin functions
    const functionFiles = await fs.readdir(FUNCTIONS_DIR);
    const functionNames = [...new Set(functionFiles.map(f => f.split('.')[0]))];

    const pluginFunctions = await Promise.all(
      functionNames.map(async (name) => {
        const specPath = path.join(FUNCTIONS_DIR, `${name}.spec.json`);
        const codePath = path.join(FUNCTIONS_DIR, `${name}.js`);

        const spec = JSON.parse(await fs.readFile(specPath, 'utf-8'));
        const code = await fs.readFile(codePath, 'utf-8');

        return {
          id: `dnd-${name}-${Date.now()}`, // Simple unique ID
          name: name,
          openaiSpec: spec,
          code: code,
          implementationType: 'javascript',
          outputType: 'respond_to_ai',
        };
      })
    );

    pluginTemplate.pluginFunctions = pluginFunctions;

    // Write the final plugin file
    await fs.writeFile(path.join(DIST_DIR, 'dnd-plugin.json'), JSON.stringify(pluginTemplate, null, 4));

    console.log('Plugin built successfully!');
  } catch (error) {
    console.error('Error building plugin:', error);
    process.exit(1);
  }
}

build();
