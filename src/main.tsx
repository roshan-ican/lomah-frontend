import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import { StationTerminal } from "./components/StationTerminal.tsx";
import { ShooterWait } from "./components/ShooterWait.tsx";
import { RoleSetup } from "./components/RoleSetup.tsx";
// Self-hosted, ahead of index.css so the faces are declared before anything
// uses them. These are the same two families the app always used; they are
// bundled rather than fetched because the range has no internet, and a
// stylesheet the browser cannot reach blocks the first paint entirely.
// Only the weights index.css asks for (400/500/600), and only the latin
// subset: neither family covers Arabic, so the ar UI falls through to the
// system stack either way and the other subsets are dead weight.
import "@fontsource/inter/latin-400.css";
import "@fontsource/inter/latin-500.css";
import "@fontsource/inter/latin-600.css";
import "@fontsource/jetbrains-mono/latin-400.css";
import "@fontsource/jetbrains-mono/latin-500.css";
import "@fontsource/jetbrains-mono/latin-600.css";
import "./index.css";
import { HashRouter } from "react-router-dom";

// Service worker helps production/PWA offline use — disabled in dev so Vite HMR
// works, and skipped off http(s). The shooter and role-picker windows are
// loaded from a file:// bootstrap, where registering a worker scoped to "/"
// cannot succeed: it resolves to file:///sw.js and fails with an unhelpful
// "unknown error occurred when fetching the script".
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
