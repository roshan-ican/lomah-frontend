// Pins artifacts/ to CommonJS.
//
// napi emits index.js, and Node decides a .js file's module system from the
// nearest package.json above it. Once this directory is copied into the
// installer as resources/app/native/ it carries no package.json of its own, so
// that search escapes upward — in a dev tree it reaches frontend/package.json,
// which declares "type": "module". index.js is then loaded as ESM, __dirname is
// undefined, the existsSync() guard for the local .node silently fails, and the
// loader falls through to requiring a published npm package that does not exist:
//
//   Error: Cannot find module 'lomah-core-win32-x64-msvc'
//
// An installed app happens to escape this (nothing above it declares a type),
// so the failure only shows up in releases/win-unpacked — the tree used by
// `npm run electron:sync` and by launching the unpacked build to test it.
// Depending on install location for correctness is what this file removes.
// Same problem, same shape of fix, as dist/backend.cjs in lomah-nest.
import { writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const out = join(dirname(fileURLToPath(import.meta.url)), '..', 'artifacts', 'package.json');
writeFileSync(out, JSON.stringify({ type: 'commonjs' }, null, 2) + '\n');
console.log(`  artifacts/package.json  {"type":"commonjs"}`);
