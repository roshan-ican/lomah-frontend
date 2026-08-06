# LOMAH Frontend — Architecture & Debugging Map

A field-deployed Electron app for a live-fire shooting range. Sensors detect
shots, a local backend scores them, and this UI shows lanes, targets, and shot
history in real time. **It runs offline** — no internet, no cloud. This document
is the map to fix it fast when something breaks on-site.

> Companion doc for the whole system (backend, sensor protocol, DB schema): the
> repo-root `README.md`. This file is frontend-only.

---

## 1. Stack in one breath

React 19 + TypeScript, bundled by Vite 6, packaged with electron-builder.
State in Zustand (`store/sessionStore.ts`). Styling is Tailwind v4 (theme lives
in `src/index.css`). Icons `lucide-react`, animation `motion`, charts `recharts`.
No router — see §3. Verify with `npm run lint` (tsc), `npm run lint:es`
(ESLint), `npm run format` (Prettier).

Backend runs on `http://127.0.0.1:3001`; the dev server proxies `/api`, `/health`,
and `/ws` there (see `vite.config.ts`).

---

## 2. The data flow (shot → screen)

```
 physical shot
      │
      ▼
 sensor (WebSocket to backend)
      │
      ▼
 backend  ──HTTP──►  /api/sessions, /api/auth, ...   (request/response)
      │
      └──WebSocket──►  /ws   (push: shot / session:* / lane:calibrated / user:assigned ...)
                        │
                        ▼
        ┌───────────────────────────────────────────┐
        │  useRealtimeChannels.ts                    │
        │  - one socket, auto-reconnects every 3s    │
        │  - switch(event) folds each event into...  │
        └───────────────────────────────────────────┘
                        │  setChannels(...)
                        ▼
        ┌───────────────────────────────────────────┐
        │  store/sessionStore.ts  (Zustand)          │
        │  channels: ActiveShooterChannel[]  (10 lanes)
        └───────────────────────────────────────────┘
                        │  channels
                        ▼
        AdminDashboard / ShooterDashboard / TargetView ...  (render)
```

A **channel** = one lane's UI state (`ActiveShooterChannel` in `types.ts`):
shooter name, session status, the shots on the board, timers, target id. The
whole app is "10 channels and the things that mutate them."

Two ways channels change:
1. **Realtime** — a WS event arrives → `useRealtimeChannels` updates the store.
2. **Command** — admin clicks pause/create/etc → `useSessionActions` calls the
   backend, then updates the store. The backend also echoes a WS event, so the
   store often gets updated from both directions (this is intentional and the
   updates are idempotent by design).

---

## 3. Three windows, one bundle

There is **no React Router**. `src/main.tsx` picks the root component from the
URL, because the Electron main process (`electron-app/main.ts`) opens several
windows at different URLs:

| URL                       | Root component        | Purpose                          |
|---------------------------|-----------------------|----------------------------------|
| `/` (default)             | `App.tsx`             | Main admin/shooter application   |
| `/station/<n>`            | `StationTerminal.tsx` | Per-lane standalone display       |
| `/station/unassigned`     | `ShooterWait.tsx`     | Shooter bootstrap/waiting screen |
| `?lomahMode=shooter`      | `ShooterWait.tsx`     | Shooter bootstrap window         |

> ⚠️ **`StationTerminal.tsx` has its own WebSocket + shot pipeline**, separate
> from `useRealtimeChannels`. If you fix a realtime bug in the main app, check
> whether StationTerminal needs the same fix. (Unifying them is a known future
> cleanup, deliberately not done yet.)

---

## 4. Where does X live?

`App.tsx` is now a thin **orchestrator**: it holds the shared state (auth stage,
selected lane, logged-in user, zoom) and wires four hooks together, then renders
one of three screens. The real logic is in the hooks:

| Concern | File | Notes |
|---|---|---|
| App shell / state / render | `src/App.tsx` | ~380 lines: state + hook wiring + JSX |
| **Realtime WS + sync** | `src/hooks/useRealtimeChannels.ts` | socket, reconnect, the event `switch`, HTTP re-sync helpers |
| **Session commands** | `src/hooks/useSessionActions.ts` | create/pause/resume/end/discard/cancel/feedback/reset + bulk |
| **Calibration** | `src/hooks/useCalibration.ts` | nudge shots / align the board |
| **Auth** | `src/hooks/useAuthFlow.ts` | login/register/logout + session restore + shooter roster |
| Pure channel transforms | `src/store/channelMutations.ts` | `toVacantLane`, `applyCalibratedShots` (no side effects) |
| Channel store | `src/store/sessionStore.ts` | the 10 channels (Zustand, persisted to `sessionStorage`) |
| HTTP client + auth token | `src/utils/api.ts` | `apiFetch` attaches the bearer token |
| Channel/session helpers | `src/utils/helper.ts` | `getLaneIdFromChannelId`, `applyApiSessionToChannel`, ... |
| Shot coordinate math | `src/utils/shotCoordinates.ts` + `@shared/coordinates` | mm ↔ sensor ↔ SVG, scoring |
| Translations | `src/translations.ts` | en/ar strings |
| Admin UI | `src/modules/admin/components/` | dashboard, lanes, reports |
| Shooter UI | `src/modules/shooter/components/` | dashboard, `TargetView`, side rail |

### The ref-mirror pattern (important gotcha)

Inside `useRealtimeChannels`, the socket's `onmessage` handler is created once
per connection but needs the **current** auth stage / user / assigned lane when
an event arrives. Reading React state there would capture stale values, so each
is mirrored into a `useRef` that a tiny effect keeps current (`authStageRef`
etc.). **Rule:** the state props are the source of truth; the `*Ref` values are
just "latest value, readable from inside the socket callback." If you add a new
piece of state the socket needs, add a ref + sync effect the same way.

### Two persistence layers (gotcha)

- **`localStorage`**: auth token, role, username, theme, current `laneId`.
- **`sessionStorage`**: the channels store (clears when the window closes).

So a full reload keeps you logged in (localStorage) but the channels re-sync
fresh from the backend.

---

## 5. Symptom → where to look

| Symptom | Start here |
|---|---|
| Shots not appearing on the board | `useRealtimeChannels.ts` → `case "shot"`; then `channelMutations`/`shotCoordinates` mapping. Check the WS is connected (Network tab / backend on :3001). |
| A lane won't pause/resume/end | `useSessionActions.ts` (the matching `handle*`). Check the backend response. |
| Calibration doesn't move shots | `useCalibration.ts`; the `lane:calibrated` / `shot:calibrated` WS cases also update shots. |
| Login fails / kicked to portal | `useAuthFlow.ts`. A 401/403 on the roster fetch bounces you to `LOGIN_ADMIN`. |
| Reload logs me out / wrong screen | `useAuthFlow.ts` session-restore effect + `utils/api.ts` token storage. |
| Shooter not assigned to a lane | `useRealtimeChannels.ts` → `user:assigned` case + `syncShooterAssignmentFromApi`. |
| Timer / bullet count wrong | `modules/shooter/components/SessionTimer.tsx` / `BulletCounter.tsx`; timing uses `formatTimeRemaining` in `utils/api.ts`. |
| A per-lane station window is wrong (but main app is fine) | `components/StationTerminal.tsx` (separate pipeline — see §3). |
| Nothing updates, no errors | Is the backend up on :3001? Is the WebSocket open? `useRealtimeChannels` auto-reconnects every 3s; watch the console for `[WebSocket]`. |
| Whole screen blank after an edit | `npm run lint` (tsc) — a type error won't stop Vite dev but will surface here. |

---

## 6. Ground rules when editing

- Run `npm run lint` **and** `npm run lint:es` before trusting a change; there
  is no test suite, so these + actually clicking through the app are your safety net.
- Keep the **realtime** path (`useRealtimeChannels`) and the **command** path
  (`useSessionActions`) in sync — most session shapes exist in both.
- WS effect dependency arrays are intentionally minimal (`[authStage]`) with an
  `eslint-disable` — do not "fix" them to include every referenced value, or the
  socket will reconnect on every render.
- Toggle **language (en/ar)** and **theme (dark/light)** after UI changes — RTL
  and both color schemes are first-class.
