import { app } from "electron";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const appDir = path.dirname(fileURLToPath(import.meta.url));

/** The shape the renderer's `startDiscovery` already receives. */
export interface DiscoveryResult {
  host: string;
  port: number;
}

/** The addon's surface. Mirrors lomah-core/artifacts/index.d.ts, except that
 *  `startDiscovery` is narrowed: napi generates `Promise<unknown>` for an
 *  AsyncTask returning an optional object, and casting that at all three call
 *  sites instead of once here is how the two drift apart. */
interface LomahCore {
  getStoredMode(): "admin" | "shooter" | null;
  setStoredMode(mode: "admin" | "shooter"): void;
  getStoredAdminHost(): string | null;
  setStoredAdminHost(host: string): void;
  getLaunchMode(): "admin" | "shooter" | null;
  startDiscovery(
    timeoutMs: number,
    ignoreSelf: boolean,
  ): Promise<DiscoveryResult | null>;
  cancelDiscovery(): void;
}

/** Same packaged/unpackaged split as resolveBackendDir() and
 *  resolveFrontendDist() in main.ts. Packaged, electron-builder's
 *  extraResources drops the addon beside the backend; unpackaged it is wherever
 *  `npm run build:native` left it. */
function resolveNativeDir(): string {
  if (app.isPackaged) {
    return path.join(process.resourcesPath, "app", "native");
  }
  return path.resolve(appDir, "..", "lomah-core", "artifacts");
}

/** createRequire rather than an import, and a computed path rather than a
 *  literal one: the location depends on app.isPackaged, so the bundler cannot
 *  follow it — which is the point. A .node binary also cannot be loaded from
 *  inside app.asar, which is why it ships as an extraResource at all.
 *
 *  napi's generated index.js resolves the .node relative to itself, so pointing
 *  at index.js is enough; the platform triple stays its problem. */
function loadCore(): LomahCore {
  const dir = resolveNativeDir();
  const entry = path.join(dir, "index.js");
  try {
    return createRequire(import.meta.url)(entry) as LomahCore;
  } catch (err) {
    // Deliberately fatal. The role and the admin election both come from here,
    // and the failure mode of carrying on without them is two admins on one
    // range splitting the lanes across two databases — silently. A dead app is
    // the better outcome, but only if it says why.
    throw new Error(
      `[native] Could not load the lomah-core addon from ${entry}. ` +
        `Packaged builds get it from extraResources ("lomah-core/artifacts" -> "app/native"); ` +
        `in development run \`npm run build:native\` first. ` +
        `Original error: ${(err as Error).message}`,
    );
  }
}

export const core: LomahCore = loadCore();
