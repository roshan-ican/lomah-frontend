import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import { StationTerminal } from "./components/StationTerminal.tsx";
import { ShooterWait } from "./components/ShooterWait.tsx";
import { RoleSetup } from "./components/RoleSetup.tsx";
import "./index.css";
import { HashRouter } from "react-router-dom";

// Service worker helps production/PWA offline use — disable in dev so Vite HMR works.
if ("serviceWorker" in navigator) {
  if (import.meta.env.PROD) {
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

function Root() {
  if (isRoleSetup) return <RoleSetup />;
  if (isShooterBootstrap) return <ShooterWait />;
  if (isStationRoute) return <StationTerminal />;
  if (isUnassigned) return <ShooterWait />;
  return <App />;
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <HashRouter>
      <Root />
    </HashRouter>
  </StrictMode>,
);
