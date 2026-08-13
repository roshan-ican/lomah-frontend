// Fast-path for local iteration: pushes a fresh frontend + backend build into
// an already-packaged releases/win-unpacked/ install, without going through
// electron-builder again.
//
// `npm run electron:build` takes ~50s end-to-end, and roughly 30s of that is
// electron-builder repacking the asar, stamping the exe, building the NSIS
// installer and its block map — none of which changes when the only edits
// are in src/ or lomah-nest/. That work only matters for a real release
// artifact, or when electron-app/main.ts or preload.ts changed (those are
// packed into app.asar itself, which this script does not touch — a real
// `npm run electron:build` is still required for those).
//
// This copies exactly the files electron-builder's own `extraResources`
// config (see package.json "build.extraResources") would have copied, so the
// running app can't tell the difference. Run `npm run electron:build` once
// first to create releases/win-unpacked/ — this script only refreshes it.
import { cpSync, existsSync, mkdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const REPO_ROOT = resolve(ROOT, "..");
const APP_DIR = join(ROOT, "releases", "win-unpacked", "resources", "app");

if (!existsSync(APP_DIR)) {
  console.error(
    `[sync-unpacked] ${APP_DIR} does not exist yet.\n` +
      "Run `npm run electron:build` once first to produce a packaged app, " +
      "then use this script to refresh it quickly.",
  );
  process.exit(1);
}

const copies = [
  [join(ROOT, "dist"), join(APP_DIR, "dist")],
  [
    join(REPO_ROOT, "lomah-nest", "dist", "backend.cjs"),
    join(APP_DIR, "backend", "backend.cjs"),
  ],
  [
    join(REPO_ROOT, "lomah-nest", "prisma-runtime"),
    join(APP_DIR, "backend", "node_modules"),
  ],
  [
    join(REPO_ROOT, "lomah-nest", ".env.production"),
    join(APP_DIR, "backend", ".env"),
  ],
];

for (const [from, to] of copies) {
  mkdirSync(dirname(to), { recursive: true });
  cpSync(from, to, { recursive: true, force: true });
  console.log(`[sync-unpacked] ${from} -> ${to}`);
}

// Migrations: only .sql files and the lock file, matching the "filter" on
// this extraResources entry in package.json — the rest of the migrations
// folder (if anything else ever lands there) has no reason to ship.
const migrationsFrom = join(REPO_ROOT, "lomah-nest", "prisma", "migrations");
const migrationsTo = join(APP_DIR, "backend", "prisma", "migrations");
mkdirSync(migrationsTo, { recursive: true });
cpSync(migrationsFrom, migrationsTo, {
  recursive: true,
  force: true,
  filter: (src) =>
    src.endsWith(".sql") || src.endsWith("migration_lock.toml") || !src.includes("."),
});
console.log(`[sync-unpacked] ${migrationsFrom} -> ${migrationsTo}`);

console.log(
  "[sync-unpacked] Done. Launch releases/win-unpacked/LOMAH.exe directly to test.",
);
