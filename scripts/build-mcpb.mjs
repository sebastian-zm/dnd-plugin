import fs from 'fs/promises';
import { createWriteStream } from 'fs';
import path from 'path';
import { createRequire } from 'module';
const { ZipArchive } = createRequire(import.meta.url)('archiver');

const DIST_DIR = 'dist';
const STAGING_DIR = path.join(DIST_DIR, 'mcpb-staging');
const OUT_FILE = path.join(DIST_DIR, 'dnd-plugin.mcpb');

async function buildMcpb() {
  await fs.rm(STAGING_DIR, { recursive: true, force: true });
  await fs.mkdir(path.join(STAGING_DIR, 'server'), { recursive: true });

  // Stub that delegates to the latest published version via npx
  await fs.writeFile(
    path.join(STAGING_DIR, 'server', 'index.mjs'),
    `import { spawn } from 'child_process';
const proc = spawn('npx', ['-y', 'github:sebastian-zm/dnd-plugin'], {
  env: process.env,
  stdio: 'inherit',
});
proc.on('exit', code => process.exit(code ?? 0));
`,
  );

  await fs.copyFile('src/manifest.json', path.join(STAGING_DIR, 'manifest.json'));

  try {
    await fs.copyFile('src/assets/icon.svg', path.join(STAGING_DIR, 'icon.svg'));
  } catch {
    // icon is optional
  }

  await fs.rm(OUT_FILE, { force: true });

  await new Promise((resolve, reject) => {
    const output = createWriteStream(OUT_FILE);
    const archive = new ZipArchive({ zlib: { level: 9 } });
    output.on('close', resolve);
    archive.on('error', reject);
    archive.pipe(output);
    archive.directory(STAGING_DIR, false);
    archive.finalize();
  });

  await fs.rm(STAGING_DIR, { recursive: true, force: true });

  console.log(`Built: ${OUT_FILE}`);
}

buildMcpb().catch(err => {
  console.error('Error building MCPB:', err);
  process.exit(1);
});
