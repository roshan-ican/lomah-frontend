/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_BACKEND_URL?: string;
  readonly VITE_WS_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

export {};

declare global {
  interface ElectronAPI {
    isElectron: boolean;
    getCurrentMode: () => Promise<"admin" | "shooter">;
    setMode: (mode: "admin" | "shooter") => Promise<void>;
    quitApp: () => Promise<void>;
    getAdminIp: () => Promise<string | null>;
    startDiscovery: () => Promise<{ host: string; port: number } | null>;
    cancelDiscovery: () => Promise<void>;
    manualConnect: (ip: string) => Promise<boolean>;
    openLogsFolder: () => Promise<void>;
    getLogsPath: () => Promise<string>;
  }

  interface Window {
    electronAPI?: ElectronAPI;
  }
}
