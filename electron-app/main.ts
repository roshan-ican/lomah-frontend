import { app, BrowserWindow, ipcMain, shell } from "electron";
import path from "node:path";
import fs from "node:fs";
import dgram from "node:dgram";
import os from "node:os";
import crypto from "node:crypto";
import { fileURLToPath, pathToFileURL } from "node:url";
import { spawn, type ChildProcess, execFile } from "node:child_process";
import { promisify } from "node:util";

const appDir = path.dirname(fileURLToPath(import.meta.url));
const BACKEND_PORT = Number(process.env.BACKEND_PORT) || 3001;

// Pin the app identity so `userData` resolves to the same folder in dev, after
// a rebuild, and when packaged. Electron otherwise derives it from whichever
// package.json "name" it finds first, which drifts depending on how the app was
// launched (this has already caused data to land in different folders).
//
// DO NOT CHANGE THIS STRING. userData is %APPDATA%\LOMAH on Windows, and it now
// holds the SQLite database (passed to the backend as LOMAH_DATA_DIR when it is
// spawned) as well as the mode file, device id, admin host and logs. Renaming it
// repoints the app at an empty folder and the range's whole history looks lost.
app.setName("LOMAH");

// ── Mode management ───────────────────────────────────────────────────────────
const USER_DATA = app.getPath("userData");
const MODE_FILE = path.join(USER_DATA, "lomah-mode.json");
const ADMIN_HOST_FILE = path.join(USER_DATA, "admin-host.json");

function getStoredMode(): "admin" | "shooter" | null {
  try {
    if (fs.existsSync(MODE_FILE)) {
      return JSON.parse(fs.readFileSync(MODE_FILE, "utf-8")).mode;
    }
  } catch (e) {
    console.error(e);
  }
  return null;
}

function getStoredAdminHost(): string | null {
  try {
    if (fs.existsSync(ADMIN_HOST_FILE)) {
      const parsed = JSON.parse(fs.readFileSync(ADMIN_HOST_FILE, "utf-8"));
      return typeof parsed.host === "string" ? parsed.host : null;
    }
  } catch (e) {
    console.error(e);
  }
  return null;
}

function getLaunchMode(): "admin" | "shooter" | null {
  const arg = process.argv.find((value) => value.startsWith("--role="));
  const mode = arg?.split("=")[1]?.toLowerCase();
  return mode === "admin" || mode === "shooter" ? mode : null;
}

function setStoredAdminHost(host: string): void {
  const cleanHost = host.replace(/^.*:/, "").trim();
  if (!cleanHost) return;
  const dir = path.dirname(ADMIN_HOST_FILE);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(ADMIN_HOST_FILE, JSON.stringify({ host: cleanHost }));
}

let adminIp: string | null = getStoredAdminHost();

// ── UDP beacon listener (shooter mode) ───────────────────────────────────────
const DISCOVERY_PORT = 5002;
/** How long to listen for an existing admin before claiming the role (backend beacons every 2s). */
const ADMIN_CONFLICT_TIMEOUT_MS = 4500;
let discoverySocket: dgram.Socket | null = null;
let discoveryTimeout: ReturnType<typeof setTimeout> | null = null;

function closeDiscoverySocket(): Promise<void> {
  return new Promise((resolve) => {
    if (!discoverySocket) return resolve();
    const sock = discoverySocket;
    discoverySocket = null;
    const done = () => resolve();
    sock.once("close", done);
    try {
      sock.close();
    } catch {
      done();
      return;
    }
    setTimeout(done, 250);
  });
}

interface DiscoveryResult {
  host: string;
  port: number;
}

function parseBeacon(msg: Buffer): number {
  const text = msg.toString();
  if (!text.startsWith("LOMAH-ADMIN")) return 0;
  const port = Number(text.split("|")[1]);
  return Number.isFinite(port) && port > 0 ? port : BACKEND_PORT;
}

function normalizeDiscoveryHost(address: string): string {
  const host = address.replace(/^.*:/, "").trim();
  if (!host || host === "0.0.0.0") return "";
  return host;
}

/** Every IPv4 address this machine owns — used to distinguish our own beacon from a different admin. */
function getLocalIPv4Addresses(): Set<string> {
  const addresses = new Set<string>(["127.0.0.1"]);
  for (const entries of Object.values(os.networkInterfaces())) {
    for (const entry of entries ?? []) {
      if (entry.family === "IPv4") addresses.add(entry.address);
    }
  }
  return addresses;
}

/** Listen for an admin beacon. ignoreSelf skips our own beacons so a leftover backend doesn't lock us out of admin mode. */
function listenForBeacon(
  timeoutMs = 10000,
  opts: { ignoreSelf?: boolean } = {},
): Promise<DiscoveryResult | null> {
  const localAddresses = opts.ignoreSelf ? getLocalIPv4Addresses() : null;
  return new Promise((resolve) => {
    let settled = false;
    const finish = (result: DiscoveryResult | null) => {
      if (settled) return;
      settled = true;
      if (discoveryTimeout) {
        clearTimeout(discoveryTimeout);
        discoveryTimeout = null;
      }
      void closeDiscoverySocket().then(() => resolve(result));
    };

    void (async () => {
      await closeDiscoverySocket();

      discoverySocket = dgram.createSocket({ type: "udp4", reuseAddr: true });

      discoverySocket.on("error", (err) => {
        console.error("[discovery] socket error:", err.message);
        finish(null);
      });

      discoverySocket.on("message", (msg, rinfo) => {
        const port = parseBeacon(msg);
        if (!port) return;
        const host = normalizeDiscoveryHost(rinfo.address);
        if (!host) return;
        if (localAddresses?.has(host)) return;
        finish({ host, port });
      });

      discoveryTimeout = setTimeout(() => finish(null), timeoutMs);

      discoverySocket.bind(DISCOVERY_PORT, "0.0.0.0", () => {
        // bind errors are caught by the socket "error" handler above
      });
    })();
  });
}

async function cancelDiscovery() {
  if (discoveryTimeout) {
    clearTimeout(discoveryTimeout);
    discoveryTimeout = null;
  }
  await closeDiscoverySocket();
}

// ── Backend process management (admin mode) ───────────────────────────────────
// lomah-nest (NestJS) replaced the old backend. It is compiled ahead of time
// with `nest build` and run as `node dist/src/main.js` — unlike the old backend,
// it cannot run directly under tsx: NestJS's DI resolves constructor
// parameter types from emitDecoratorMetadata, which esbuild (tsx's
// transpiler) does not emit. Only a real tsc build produces that metadata.
function resolveBackendDir(): string {
  if (app.isPackaged) {
    return path.join(process.resourcesPath, "app", "backend");
  }
  return path.resolve(appDir, "..", "..", "lomah-nest");
}

const BACKEND_DIR = resolveBackendDir();
// Prisma's sqlite "file:" URLs expect forward slashes even on Windows —
// a raw backslashed absolute path fails to parse.
const BACKEND_DB_URL = `file:${path.join(USER_DATA, "lomah.db").replace(/\\/g, "/")}`;

/** Persisted per-install so packaged builds never run on the .env default. */
function getOrCreateJwtSecret(): string {
  const secretFile = path.join(USER_DATA, "jwt-secret.txt");
  try {
    if (fs.existsSync(secretFile)) return fs.readFileSync(secretFile, "utf-8").trim();
  } catch (e) {
    console.error(e);
  }
  const secret = crypto.randomBytes(48).toString("hex");
  fs.writeFileSync(secretFile, secret);
  return secret;
}

function resolveFrontendDist(): string {
  if (app.isPackaged) {
    return path.join(process.resourcesPath, "app", "dist");
  }
  return path.resolve(appDir, "..", "dist");
}

const FRONTEND_DIST = resolveFrontendDist();

// ── Log path ──────────────────────────────────────────────────────────────────
const LOG_DIR = path.join(USER_DATA, "logs");
if (!fs.existsSync(LOG_DIR)) fs.mkdirSync(LOG_DIR, { recursive: true });
const ERROR_LOG = path.join(LOG_DIR, "backend-error.log");
const BACKEND_LOG = path.join(LOG_DIR, "backend.log");

// Buffered, non-blocking log writer.
//
// This is called for EVERY chunk of backend stdout/stderr, and the backend emits
// a multi-line coordinate trace per shot. It used to use fs.appendFileSync, so
// during live fire the Electron main process performed synchronous disk I/O on
// every bullet — blocking the event loop (and therefore the UI) exactly when the
// range is busiest. Batching into an async flush keeps the full trace on disk for
// field debugging without stalling the main process.
const pendingLogs = new Map<string, string[]>();
let logFlushTimer: ReturnType<typeof setTimeout> | null = null;

function flushLogs(): void {
  logFlushTimer = null;
  for (const [file, lines] of pendingLogs) {
    if (lines.length === 0) continue;
    const chunk = lines.join("");
    pendingLogs.set(file, []);
    fs.appendFile(file, chunk, (err) => {
      if (err) console.error("[electron] log write failed:", err.message);
    });
  }
}

function writeLog(file: string, line: string) {
  const queue = pendingLogs.get(file) ?? [];
  queue.push(`[${new Date().toISOString()}] ${line}\n`);
  pendingLogs.set(file, queue);
  if (!logFlushTimer) logFlushTimer = setTimeout(flushLogs, 250);
}

/** Best-effort synchronous drain for shutdown paths where async flush cannot run. */
function flushLogsSync(): void {
  if (logFlushTimer) {
    clearTimeout(logFlushTimer);
    logFlushTimer = null;
  }
  for (const [file, lines] of pendingLogs) {
    if (lines.length === 0) continue;
    const chunk = lines.join("");
    pendingLogs.set(file, []);
    try {
      fs.appendFileSync(file, chunk);
    } catch {
      /* shutting down — nothing useful to do */
    }
  }
}

let backendProc: ChildProcess | null = null;
let backendOwnedByElectron = false;

/** Free a port held by a stale process. Returns true if anything was killed. */
async function killProcessOnPort(
  port: number,
  protocol: "TCP" | "UDP" = "TCP",
): Promise<boolean> {
  let killedAny = false;
  try {
    const filter =
      protocol === "TCP"
        ? `netstat -ano | findstr :${port} | findstr LISTENING`
        : `netstat -ano | findstr :${port} | findstr UDP`;

    // Piped shell syntax, so go through cmd rather than execFile directly.
    const { stdout } = await execFileAsync("cmd.exe", ["/c", filter], {
      windowsHide: true,
    });

    const pids = new Set<number>();
    for (const line of stdout.split("\n")) {
      const match = line.trim().match(/(\d+)\s*$/);
      if (match) pids.add(parseInt(match[1]!, 10));
    }

    for (const pid of pids) {
      try {
        await execFileAsync("taskkill", ["/F", "/PID", String(pid)], {
          windowsHide: true,
        });
        killedAny = true;
        console.log(
          `[electron] Killed stale process PID ${pid} on ${protocol} port ${port}`,
        );
      } catch (e) {
        console.error(e);
      }
    }
  } catch {
    // findstr exits non-zero when nothing matches — that is the normal
    // "port is free" case, not an error worth logging.
  }
  return killedAny;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Database lives in USER_DATA, never inside the install directory — an NSIS
 *  update replaces `resources/`, and Program Files is read-only for non-admin
 *  users. Runs on every launch: `migrate deploy` is a no-op once the schema is
 *  current, and this is what turns a brand-new %APPDATA% into a valid db on
 *  first run without shipping a pre-seeded database file. */
async function runMigrations(): Promise<void> {
  const prismaCli = path.join(BACKEND_DIR, "node_modules", "prisma", "build", "index.js");
  const schemaPath = path.join(BACKEND_DIR, "prisma", "schema.prisma");
  await execFileAsync(
    process.execPath,
    [prismaCli, "migrate", "deploy", "--schema", schemaPath],
    {
      cwd: BACKEND_DIR,
      windowsHide: true,
      env: {
        ...process.env,
        ELECTRON_RUN_AS_NODE: "1",
        DATABASE_URL: BACKEND_DB_URL,
      },
    },
  );
}

async function startBackend(): Promise<void> {
  if (backendProc && !backendProc.killed) return;

  const [killedTcp, killedUdp] = await Promise.all([
    killProcessOnPort(BACKEND_PORT, "TCP"),
    killProcessOnPort(5001, "UDP"), // shot ingestion receiver — was never being cleaned up
  ]);

  // Only wait for the OS to release the sockets if we actually killed something.
  // On a clean boot (the common case) there is nothing to wait for, so this
  // no longer costs every launch half a second.
  if (killedTcp || killedUdp) await sleep(500);

  await runMigrations();

  const distMain = path.join(BACKEND_DIR, "dist", "src", "main.js");

  backendProc = spawn(process.execPath, [distMain], {
    cwd: BACKEND_DIR,
    stdio: ["ignore", "pipe", "pipe"],
    windowsHide: true,
    env: {
      ...process.env,
      PORT: String(BACKEND_PORT),
      HOST: "0.0.0.0",
      ELECTRON_RUN_AS_NODE: "1",
      DATABASE_URL: BACKEND_DB_URL,
      JWT_SECRET: getOrCreateJwtSecret(),
    },
  });
  backendOwnedByElectron = true;

  backendProc.stdout?.on("data", (chunk) => {
    const msg = chunk.toString();
    process.stdout.write(msg);
    writeLog(BACKEND_LOG, msg);
  });
  backendProc.stderr?.on("data", (chunk) => {
    const msg = chunk.toString();
    process.stderr.write(msg);
    writeLog(BACKEND_LOG, msg);
  });
  backendProc.on("exit", (code, sig) => {
    writeLog(ERROR_LOG, `exited code=${code} sig=${sig}`);
    // The async flush's setTimeout may never fire once the process is tearing
    // down around it — drain synchronously so the exit line (and anything just
    // before it) actually reaches disk instead of being lost mid-buffer.
    flushLogsSync();
    backendProc = null;
  });
}
function stopBackend(): Promise<void> {
  return new Promise((resolve) => {
    if (!backendOwnedByElectron || !backendProc) return resolve();
    const p = backendProc;
    backendProc = null;
    backendOwnedByElectron = false;
    p.once("exit", () => resolve());
    try {
      p.kill("SIGTERM");
    } catch {
      resolve();
    }
    setTimeout(() => {
      try {
        p.kill("SIGKILL");
      } catch {
        /* */
      }
      resolve();
    }, 5000);
  });
}

async function ensureBackend(): Promise<boolean> {
  const healthUrl = `http://127.0.0.1:${BACKEND_PORT}/health`;
  if (await pollHealth(healthUrl, 2000)) {
    console.log(
      "[electron] Using existing backend (browser/dev or another instance)",
    );
    return true;
  }
  console.log(`[electron] Starting backend from: ${BACKEND_DIR}`);
  await startBackend();
  return pollHealth(healthUrl, 30000);
}

function pollHealth(url: string, timeoutMs = 30000): Promise<boolean> {
  return new Promise((resolve) => {
    const deadline = Date.now() + timeoutMs;
    const check = async () => {
      try {
        const res = await fetch(url);
        if (res.ok) return resolve(true);
      } catch {
        /* not ready yet */
      }
      if (Date.now() >= deadline) return resolve(false);
      // 200ms, not 1000ms: this runs on every admin boot, and at second
      // granularity the app sat idle for up to a full second after the backend
      // was already answering.
      setTimeout(check, 500);
    };
    check();
  });
}

// ── IPC handlers ──────────────────────────────────────────────────────────────
// null means "no role decided yet" — a genuine first run, or a fresh install
// with no --role= arg and no lomah-mode.json. This USED to fall back to
// "admin" unconditionally, which is why two tablets powered on together both
// silently became admin (each started its own backend against its own
// %APPDATA% database) before either operator got a say. Now an undecided
// device is routed to the role picker below instead of guessing.
let currentMode: "admin" | "shooter" | null =
  getLaunchMode() || getStoredMode() || null;

function urlForMode(targetMode: "admin" | "shooter"): string {
  const devUrl = process.env.VITE_DEV_SERVER_URL;
  const pathname = targetMode === "shooter" ? "/station/unassigned" : "/";
  // vite-plugin-electron sets VITE_DEV_SERVER_URL with a trailing slash —
  // concatenating without stripping it produces a double slash that
  // Electron's navigation rejects with ERR_ABORTED.
  if (devUrl) return `${devUrl.replace(/\/$/, "")}${pathname}`;
  if (targetMode === "admin") return `http://127.0.0.1:${BACKEND_PORT}/`;

  return createStaticBootstrapUrl("shooter");
}

/** The first-run role picker. Loaded with no backend running and no role
 *  claimed yet — deliberately: it must be safe to show before either device
 *  has decided anything, so it can't depend on this machine's own backend. */
function urlForPicker(): string {
  const devUrl = process.env.VITE_DEV_SERVER_URL;
  if (devUrl) return `${devUrl.replace(/\/$/, "")}/?lomahMode=picker`;
  return createStaticBootstrapUrl("picker");
}

/** Writes a standalone copy of the built SPA with asset paths rewritten to
 *  file:// URLs, tagged with `?lomahMode=<mode>` so main.tsx's Root() renders
 *  the right screen. Used for any UI that must render without a running
 *  backend on this machine: the shooter (which talks to a REMOTE admin) and
 *  the role picker (which hasn't chosen a role, let alone started a backend,
 *  yet). Re-written per mode so each keeps its own tagged query string. */
function createStaticBootstrapUrl(mode: "shooter" | "picker"): string {
  const indexPath = path.join(FRONTEND_DIST, "index.html");
  let html = fs.readFileSync(indexPath, "utf-8");

  const assetBase = pathToFileURL(
    path.join(FRONTEND_DIST, "assets"),
  ).toString();
  html = html
    .replaceAll('src="/assets/', `src="${assetBase}/`)
    .replaceAll('href="/assets/', `href="${assetBase}/`)
    .replaceAll(
      'href="/manifest.json"',
      `href="${pathToFileURL(path.join(FRONTEND_DIST, "manifest.json")).toString()}"`,
    );

  const bootstrapPath = path.join(USER_DATA, `${mode}-bootstrap.html`);
  fs.writeFileSync(bootstrapPath, html);
  return `${pathToFileURL(bootstrapPath).toString()}?lomahMode=${mode}`;
}

/** Persist the active mode and keep `currentMode` in step with it. */
function setStoredMode(mode: "admin" | "shooter"): void {
  fs.writeFileSync(MODE_FILE, JSON.stringify({ mode }));
  currentMode = mode;
}

/** Shows the "another admin is already running" dialog and, if the operator
 *  agrees, demotes this device to shooter (pointed straight at the rival so it
 *  doesn't need to re-run discovery) and tears down anything this device had
 *  already started. Shared by both the pre-start and post-start checks in
 *  claimAdminRole, since a race can be caught at either point. */
async function yieldToRivalAdmin(existing: DiscoveryResult): Promise<boolean> {
  console.warn(
    `[electron] Admin already running at ${existing.host}:${existing.port} — refusing second admin.`,
  );

  const { dialog } = await import("electron");
  const { response } = await dialog.showMessageBox({
    type: "warning",
    title: "Admin Already Running",
    message: `Another LOMAH admin is already running on this range at ${existing.host}.`,
    detail:
      "Only one admin can run at a time — a second one would split the lanes " +
      "between two separate databases.\n\nYou can join this range as a shooter " +
      "instead, or close the other admin first and try again.",
    buttons: ["Join as Shooter", "Quit"],
    defaultId: 0,
    cancelId: 1,
    noLink: true,
  });

  if (response !== 0) return false;

  // Point this machine at the admin we just found, so shooter mode connects
  // straight away instead of re-running discovery. setStoredAdminHost only
  // touches the file — adminIp is in-memory and must be set alongside it.
  setStoredAdminHost(existing.host);
  adminIp = existing.host;
  setStoredMode("shooter");
  await stopBackend();
  return true;
}

/** Only one admin can run at a time — a second would split lanes across two
 *  databases with no stale lock to break.
 *
 *  The pre-start check alone has a real race: if two devices are both chosen
 *  as admin at nearly the same instant, NEITHER backend is beaconing yet, so
 *  both hear silence and both proceed. Two mitigations:
 *   - jitter on the wait, so two devices starting in lockstep don't finish
 *     listening at the same instant either;
 *   - a second, short listen taken AFTER this device's own backend is up.
 *     By then a rival that started even slightly earlier is beaconing, so this
 *     is what actually closes the window — the first check just makes the
 *     common case (one device clearly first) resolve without starting a
 *     backend at all. */
async function claimAdminRole(): Promise<boolean> {
  const jitteredWait = ADMIN_CONFLICT_TIMEOUT_MS + Math.random() * 2000;
  const existing = await listenForBeacon(jitteredWait, { ignoreSelf: true });
  if (existing) return yieldToRivalAdmin(existing);
  return true;
}

/** The post-start half of the race guard described on claimAdminRole. Short
 *  window — by this point a genuine rival has had this device's whole backend
 *  startup time to have started beaconing, so a long wait isn't needed. */
async function recheckForRivalAdminAfterStart(): Promise<boolean> {
  const existing = await listenForBeacon(1500, { ignoreSelf: true });
  if (!existing) return true;
  return yieldToRivalAdmin(existing);
}

async function prepareMode(targetMode: "admin" | "shooter"): Promise<boolean> {
  const devUrl = process.env.VITE_DEV_SERVER_URL;
  if (targetMode === "shooter") {
    await cancelDiscovery();
    // Switching to shooter should feel instant. Shutting the backend down can
    // take seconds (SIGTERM, then a SIGKILL fallback), and blocking the role
    // switch on it is what made this feel unresponsive — nothing about loading
    // the shooter UI depends on it having finished, so let it run in the
    // background. Same for the firewall rules, which are only needed by the time
    // the user actually presses Scan.
    void stopBackend();
    void ensureFirewallRules();
    return true;
  }

  // Dev mode skips backend process management below (npm run dev already runs
  // the backend separately) and the single-admin conflict check, but a device
  // on another subnet/LAN still needs these ports open to reach this machine's
  // dev backend at all — without this, manual-connect health checks from a
  // shooter just time out with no explanation.
  if (devUrl) {
    await ensureFirewallRules();
    return true;
  }

  // Must run BEFORE the single-admin check: that check needs inbound UDP on
  // the discovery port, and on a first launch no rule exists yet. Cached after
  // the first successful run, so later launches skip it entirely.
  await ensureFirewallRules();

  // May fall back to shooter mode, in which case currentMode is updated and
  // callers must read it rather than the mode they asked for.
  if (!(await claimAdminRole())) return false;
  if (currentMode !== "admin") return true;

  const healthy = await ensureBackend();
  if (!healthy) {
    console.error("[electron] Backend failed to start within 30s.");
    const { dialog } = await import("electron");
    dialog.showErrorBox(
      "Backend Error",
      `The LOMAH backend failed to start.\n\nSee logs at:\n${LOG_DIR}`,
    );
    return false;
  }
  console.log("[electron] Backend healthy.");

  // Closes the two-devices-boot-together race the earlier claimAdminRole()
  // check cannot: see recheckForRivalAdminAfterStart's own comment. Either
  // outcome (still admin, or just demoted to shooter) is a "true" here —
  // callers read currentMode afterward rather than trusting this return value
  // to say which.
  return recheckForRivalAdminAfterStart();
}

ipcMain.handle("set-mode", async (_e, newMode: "admin" | "shooter") => {
  await cancelDiscovery();
  setStoredMode(newMode);
  const ready = await prepareMode(newMode);
  if (!ready) {
    app.quit();
    return;
  }
  // prepareMode may have demoted us to shooter because another admin is
  // already running, so load the mode we actually ended up in.
  const url = urlForMode(currentMode ?? newMode);
  if (win && !win.isDestroyed()) {
    await win.loadURL(url);
  } else {
    createWindow(url);
  }
});

ipcMain.handle("get-current-mode", () => currentMode);

ipcMain.handle("get-admin-ip", () => adminIp);

ipcMain.handle("start-discovery", async () => {
  const result = await listenForBeacon();
  if (result) {
    adminIp = result.host;
    setStoredAdminHost(result.host);
  }
  return result;
});

ipcMain.handle("cancel-discovery", async () => {
  await cancelDiscovery();
});

ipcMain.handle("manual-connect", async (_e, ip: string) => {
  await cancelDiscovery();
  adminIp = ip;
  setStoredAdminHost(ip);
  return true;
});

ipcMain.handle("quit-app", async () => {
  app.quit();
});

ipcMain.handle("open-logs-folder", async () => {
  shell.openPath(LOG_DIR);
});

ipcMain.handle("get-logs-path", async () => {
  return LOG_DIR;
});

// ── BrowserWindow ─────────────────────────────────────────────────────────────
let win: BrowserWindow | null = null;

function createWindow(url: string) {
  win = new BrowserWindow({
    width: 1200,
    height: 800,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(appDir, "preload.mjs"),
    },
  });

  win.setMenuBarVisibility(false);
  win.loadURL(url);

  win.webContents.on("before-input-event", (_e, input) => {
    if (input.key === "F12") {
      win?.webContents.toggleDevTools();
    }
  });

  win.on("closed", () => {
    win = null;
  });
}

// ── Firewall rule setup ────────────────────────────────────────────────────────
//
// Everything here MUST stay asynchronous. These spawn PowerShell, which takes
// ~1-3s per invocation; running them with execSync blocks Electron's main-process
// event loop, which freezes IPC, rendering and input handling. That is what made
// the "Shooter Terminal" button look dead — the click was received, but setMode's
// IPC reply could not be processed until several synchronous PowerShell calls had
// finished, so only restarting the app appeared to work.
//
// -NoProfile matters too: loading the user's PowerShell profile is often the bulk
// of the startup cost.
const execFileAsync = promisify(execFile);

async function runPowerShell(command: string): Promise<string> {
  const { stdout } = await execFileAsync(
    "powershell.exe",
    ["-NoProfile", "-NonInteractive", "-Command", command],
    { windowsHide: true },
  );
  return stdout;
}

/** Marker recording that firewall rules are ensured. Bump RULES_VERSION to force re-apply on existing installs. */
const RULES_VERSION = 1;
const FIREWALL_MARKER = path.join(USER_DATA, "firewall-rules.json");
let firewallEnsured = false;

function firewallAlreadyEnsured(): boolean {
  if (firewallEnsured) return true;
  try {
    if (!fs.existsSync(FIREWALL_MARKER)) return false;
    const parsed = JSON.parse(fs.readFileSync(FIREWALL_MARKER, "utf-8"));
    if (parsed.version === RULES_VERSION) {
      firewallEnsured = true;
      return true;
    }
  } catch {
    /* unreadable marker — fall through and re-apply */
  }
  return false;
}

function markFirewallEnsured(): void {
  firewallEnsured = true;
  try {
    fs.writeFileSync(
      FIREWALL_MARKER,
      JSON.stringify({ version: RULES_VERSION, at: new Date().toISOString() }),
    );
  } catch (err) {
    console.warn("[Firewall] Could not write marker:", (err as Error).message);
  }
}

async function ruleExists(name: string): Promise<boolean> {
  try {
    const result = await runPowerShell(
      `Get-NetFirewallRule -DisplayName "${name}" -ErrorAction SilentlyContinue | Select-Object -ExpandProperty DisplayName`,
    );
    return result.trim().length > 0;
  } catch {
    return false;
  }
}

async function addInboundRule(
  name: string,
  protocol: "TCP" | "UDP",
  port: number,
): Promise<void> {
  if (await ruleExists(name)) return;
  console.log(`[Firewall] Adding ${protocol} rule for port ${port}...`);
  try {
    await runPowerShell(
      `New-NetFirewallRule -DisplayName "${name}" -Direction Inbound -Protocol ${protocol} -LocalPort ${port} -Action Allow -ErrorAction SilentlyContinue`,
    );
    console.log(`[Firewall] ${name} rule added successfully`);
  } catch (err) {
    console.warn(
      `[Firewall] Could not add ${name} rule (might need admin):`,
      (err as Error).message,
    );
  }
}

/** All firewall rules needed by both roles: discovery port for admin/shooter beacon, and backend port for shooter HTTP. */
async function ensureFirewallRules(): Promise<void> {
  if (firewallAlreadyEnsured()) return;
  await Promise.all([
    addInboundRule("LOMAH Node UDP", "UDP", 14555),
    addInboundRule("LOMAH Discovery UDP", "UDP", DISCOVERY_PORT),
    addInboundRule("LOMAH Backend TCP", "TCP", BACKEND_PORT),
  ]);
  markFirewallEnsured();
}

// ── Single-instance lock ──────────────────────────────────────────────────────
const gotLock = app.requestSingleInstanceLock();

if (!gotLock) {
  app.quit();
} else {
  app.on("second-instance", () => {
    if (win) {
      if (win.isMinimized()) win.restore();
      win.focus();
    }
  });

  // ── App lifecycle ─────────────────────────────────────────────────────────────
  app.whenReady().then(async () => {
    if (currentMode === null) {
      // First run, no role decided. Show the picker and stop — no backend, no
      // firewall rules, no admin claim until the operator actually chooses.
      // The "set-mode" IPC handler (used by every later role switch too) takes
      // it from here once they do.
      createWindow(urlForPicker());
      app.on("activate", () => {
        if (BrowserWindow.getAllWindows().length === 0) {
          createWindow(
            currentMode === null ? urlForPicker() : urlForMode(currentMode),
          );
        }
      });
      return;
    }

    const ready = await prepareMode(currentMode);
    if (!ready) {
      app.quit();
      return;
    }

    const url = urlForMode(currentMode);
    createWindow(url);

    app.on("activate", () => {
      if (BrowserWindow.getAllWindows().length === 0) {
        createWindow(
          currentMode === null ? urlForPicker() : urlForMode(currentMode),
        );
      }
    });
  });

  app.on("window-all-closed", async () => {
    win = null;
    await stopBackend();
    if (process.platform !== "darwin") app.quit();
  });

  app.on("before-quit", async () => {
    await stopBackend();
    flushLogsSync();
  });
}
