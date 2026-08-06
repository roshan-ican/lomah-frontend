import { contextBridge, ipcRenderer } from "electron";

contextBridge.exposeInMainWorld("electronAPI", {
  isElectron: true,
  getCurrentMode: () => ipcRenderer.invoke("get-current-mode"),
  setMode: (mode: "admin" | "shooter") => ipcRenderer.invoke("set-mode", mode),
  quitApp: () => ipcRenderer.invoke("quit-app"),
  getAdminIp: () => ipcRenderer.invoke("get-admin-ip"),
  startDiscovery: () => ipcRenderer.invoke("start-discovery"),
  cancelDiscovery: () => ipcRenderer.invoke("cancel-discovery"),
  manualConnect: (ip: string) => ipcRenderer.invoke("manual-connect", ip),
  openLogsFolder: () => ipcRenderer.invoke("open-logs-folder"),
  getLogsPath: () => ipcRenderer.invoke("get-logs-path"),
});

export {};
