import { invoke, isTauri } from "@tauri-apps/api/core";

/**
 * The desktop shell, whichever one is underneath.
 *
 * The app runs in three places — an Electron window, a Tauri window, and a
 * plain browser during `npm run dev:web` — and only the first two can set a
 * mode or scan for an admin. Components should not know which they are in, so
 * this is the one module that does.
 *
 * The surface is deliberately the same one Electron's preload exposed: nine
 * request/response calls with no push half, which is why swapping the shell
 * underneath is a rename at each call site rather than a rewrite.
 */

export interface DesktopShell {
  /** False in a browser tab, where none of the rest will work. */
  isDesktop: boolean;
  getCurrentMode: () => Promise<"admin" | "shooter" | null>;
  setMode: (mode: "admin" | "shooter") => Promise<void>;
  quitApp: () => Promise<void>;
  getAdminIp: () => Promise<string | null>;
  startDiscovery: () => Promise<{ host: string; port: number } | null>;
  cancelDiscovery: () => Promise<void>;
  manualConnect: (ip: string) => Promise<boolean>;
  openLogsFolder: () => Promise<void>;
  getLogsPath: () => Promise<string>;
  /** Where API and socket.io traffic should go. Empty means "relative to this
   *  page", which is correct whenever the backend served the page itself. */
  backendOrigin: () => Promise<string>;
}

/** Everything fails softly, because a browser tab is a supported way to run
 *  the app and must not throw its way through the boot screen. */
const browser: DesktopShell = {
  isDesktop: false,
  getCurrentMode: async () => null,
  setMode: async () => {},
  quitApp: async () => {},
  getAdminIp: async () => null,
  startDiscovery: async () => null,
  cancelDiscovery: async () => {},
  manualConnect: async () => false,
  openLogsFolder: async () => {},
  getLogsPath: async () => "",
  // Relative. In a browser the page came from the backend, so it is already
  // pointing at the right host.
  backendOrigin: async () => "",
};

const tauri: DesktopShell = {
  isDesktop: true,
  getCurrentMode: () => invoke("get_current_mode"),
  // Records the role and restarts the process, so this never returns.
  setMode: (mode) => invoke("set_mode", { modeName: mode }),
  quitApp: () => invoke("quit_app"),
  getAdminIp: () => invoke("get_admin_ip"),
  startDiscovery: () => invoke("start_discovery"),
  cancelDiscovery: () => invoke("cancel_discovery"),
  manualConnect: async (ip) => {
    // Rust returns the address it actually stored, having stripped any port
    // and unwrapped an IPv4-mapped form. An empty answer means unusable.
    const stored = await invoke<string>("manual_connect", { host: ip });
    return Boolean(stored);
  },
  openLogsFolder: () => invoke("open_logs_folder"),
  getLogsPath: () => invoke("get_logs_path"),
  backendOrigin: () => invoke("backend_origin"),
};

/** Electron's preload, adapted. Kept while both shells exist so a build from
 *  either tree behaves identically. */
function fromElectron(api: NonNullable<Window["electronAPI"]>): DesktopShell {
  return {
    isDesktop: true,
    getCurrentMode: () => api.getCurrentMode(),
    setMode: (mode) => api.setMode(mode),
    quitApp: () => api.quitApp(),
    getAdminIp: () => api.getAdminIp(),
    startDiscovery: () => api.startDiscovery(),
    cancelDiscovery: () => api.cancelDiscovery(),
    manualConnect: (ip) => api.manualConnect(ip),
    openLogsFolder: () => api.openLogsFolder(),
    getLogsPath: () => api.getLogsPath(),
    // Under Electron the admin window is served BY NestJS, so relative paths
    // already resolve to it and there is nothing to override.
    backendOrigin: async () => "",
  };
}

function detect(): DesktopShell {
  if (typeof window === "undefined") return browser;
  if (window.electronAPI?.isElectron) return fromElectron(window.electronAPI);
  if (isTauri()) return tauri;
  return browser;
}

export const platform: DesktopShell = detect();
