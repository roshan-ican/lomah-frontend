import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import { StationTerminal } from "./components/StationTerminal.tsx";
import { ShooterWait } from "./components/ShooterWait.tsx";
import { RoleSetup } from "./components/RoleSetup.tsx";
import "./index.css";
import { HashRouter } from "react-router-dom";
import { platform } from "./utils/platform.ts";
import { setBackendUrl } from "./utils/api.ts";

// Service worker helps production/PWA offline use — disable in dev so Vite HMR
// works, and skip it entirely off http(s). The Tauri shell serves its own
// screens from a custom scheme where a worker scoped to "/" is at best dead
// weight, and the pages that benefit from caching are the ones NestJS serves
// over http anyway.
if ("serviceWorker" in navigator) {
  if (import.meta.env.PROD && window.location.protocol.startsWith("http")) {
    window.addEventListener("load", () => {
      navigator.serviceWorker
        .register("/sw.js")
        .catch((err) => console.error("LOMAH SW registration failed:", err));
    });
  } else {
    void navigator.serviceWorker.getRegistrations().then((regs) => {
      for (const reg of regs) void reg.unregister();
    });
  }
}

const path = window.location.pathname;
const params = new URLSearchParams(window.location.search);
const isStationRoute = /^\/station\/\d+/.test(path);
const isUnassigned = path === "/station/unassigned";
const isShooterBootstrap = params.get("lomahMode") === "shooter";
const isRoleSetup = params.get("lomahMode") === "picker";

/**
 * Which screen this window is.
 *
 * The URL decides wherever there is one to read — that is every page NestJS
 * serves, including a shooter tablet redirected to the admin's station route.
 * The shell's mode is the fallback for the one origin with no path to go on:
 * Tauri serves its own screens from tauri://localhost/, so an admin station
 * and a shooter terminal would otherwise be indistinguishable.
 */
function Root({ mode }: { mode: "admin" | "shooter" | null }) {
  if (isRoleSetup) return <RoleSetup />;
  if (isShooterBootstrap) return <ShooterWait />;
  if (isStationRoute) return <StationTerminal />;
  if (isUnassigned) return <ShooterWait />;

  if (platform.isDesktop) {
    // No role chosen yet — first launch after an install.
    if (mode === null) return <RoleSetup />;
    if (mode === "shooter") return <ShooterWait />;
  }
  return <App />;
}

/**
 * Resolved before the first render, not after.
 *
 * Both answers come from the shell over IPC, and both change what the very
 * first request does: the origin decides where `/api` goes, and the mode
 * decides which component asks. Rendering first and correcting afterwards
 * would fire that request at the wrong place and show the wrong screen while
 * it failed.
 */
async function start() {
  const [origin, mode] = await Promise.all([
    platform.backendOrigin(),
    platform.isDesktop ? platform.getCurrentMode() : Promise.resolve(null),
  ]);

  setBackendUrl(origin);

  createRoot(document.getElementById("root")!).render(
    <StrictMode>
      <HashRouter>
        <Root mode={mode} />
      </HashRouter>
    </StrictMode>,
  );
}

void start();
