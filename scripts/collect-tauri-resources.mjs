import { copyFileSync, cpSync, existsSync, mkdirSync, readdirSync, rmSync, statSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Gathers everything the Tauri bundle has to carry that is not the Rust binary.
 *
 * Tauri, unlike Electron, bundles no Node runtime — so where the Electron build
 * could spawn itself with ELECTRON_RUN_AS_NODE=1, this one ships an actual
 * node.exe and runs the identical backend.cjs with it. That single file is most
 * of the difference between the two installers, and it is still far smaller
 * than the Chromium it replaces.
 *
 * Everything lands in src-tauri/resources, which tauri.conf.json bundles whole
 * and which backend.rs resolves relative to the executable at runtime.
 */

const here = dirname(fileURLToPath(import.meta.url));
const frontend = dirname(here);
const backend = resolve(frontend, '..', 'lomah-nest');
const out = join(frontend, 'src-tauri', 'resources');

const NODE_EXE = process.execPath;

rmSync(out, { recursive: true, force: true });
mkdirSync(out, { recursive: true });

function need(path, what) {
  if (!existsSync(path)) {
    throw new Error(`${what} is missing at ${path}. Run \`npm run build:backend\` first.`);
  }
  return path;
}

// The Node runtime. Copied from whichever node is building, which is also the
// one the bundle was tested against.
copyFileSync(NODE_EXE, join(out, 'node.exe'));

// The backend itself, and the three things it reads off disk at runtime: the
// Prisma client with its native query engine, the migration SQL, and the
// operational settings.
copyFileSync(need(join(backend, 'dist', 'backend.cjs'), 'the backend bundle'), join(out, 'backend.cjs'));
cpSync(need(join(backend, 'prisma-runtime'), 'the pruned Prisma runtime'), join(out, 'node_modules'), {
  recursive: true,
});
cpSync(join(backend, 'prisma', 'migrations'), join(out, 'prisma', 'migrations'), {
  recursive: true,
  filter: (src) => !src.endsWith('.db') && !src.includes('dev.db'),
});
copyFileSync(join(backend, '.env.production'), join(out, '.env'));

// The SPA, again.
//
// Tauri embeds it in the binary for the shell's own screens at
// tauri://localhost, but a shooter tablet is redirected to the ADMIN's server
// and served the app over HTTP by ServeStaticModule — which reads real files
// off disk and cannot see inside the binary. The duplicate costs ~1.4 MB and
// removing it would break every shooter terminal on the range.
cpSync(need(join(frontend, 'dist'), 'the built SPA'), join(out, 'dist'), { recursive: true });

const total = (function size(dir) {
  return readdirSync(dir, { withFileTypes: true }).reduce(
    (sum, entry) =>
      sum + (entry.isDirectory() ? size(join(dir, entry.name)) : statSync(join(dir, entry.name)).size),
    0,
  );
})(out);

console.log(`\n  src-tauri/resources  ${(total / 1024 / 1024).toFixed(1)} MB\n`);
