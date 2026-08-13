/**
 * Where the backend lives, as a URL prefix. Empty means "relative to this
 * page", which is correct whenever the backend served the page itself.
 *
 * Mutable, because under Tauri it cannot be known at build time. The Electron
 * admin window was served BY NestJS at 127.0.0.1:3001, so every relative
 * "/api" path resolved against it for free. Tauri serves the boot and
 * shooter-wait screens from tauri://localhost, where a relative path resolves
 * against a custom scheme that answers nothing — so the shell has to say.
 */
let BACKEND_URL = import.meta.env.VITE_BACKEND_URL ?? "";

/** Called once at startup, before anything fetches. Trailing slashes are
 *  trimmed so `${BACKEND_URL}/api/...` never doubles up. */
export function setBackendUrl(origin: string): void {
  BACKEND_URL = origin.replace(/\/+$/, "");
}

/** For call sites that build their own URLs, e.g. the socket.io clients. */
export function getBackendUrl(): string {
  return BACKEND_URL;
}

/** Every route lives under /api except /health, which main.ts excludes from
 *  the global prefix. */
const API_PREFIX = "/api";

export function getAuthToken(): string | null {
  return localStorage.getItem("token");
}

export function getAuthRole(): string | null {
  return localStorage.getItem("role");
}

export function setAuthSession(token: string, role: string, username?: string) {
  localStorage.setItem("token", token);
  localStorage.setItem("role", role);
  if (username) localStorage.setItem("username", username);
  localStorage.setItem("lomah_profile_role", role);
}

export function clearAuthSession() {
  localStorage.removeItem("token");
  localStorage.removeItem("role");
  localStorage.removeItem("username");
  localStorage.removeItem("lomah_profile_role");
  localStorage.removeItem("lomah_operator");
}

export class ApiError extends Error {
  statusCode: number;
  constructor(message: string, statusCode: number) {
    super(message);
    this.name = "ApiError";
    this.statusCode = statusCode;
  }
}

export async function apiFetch(
  path: string,
  options: RequestInit = {},
): Promise<Response> {
  const token = getAuthToken();
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(options.headers as Record<string, string>),
  };
  if (token) headers.Authorization = `Bearer ${token}`;

  return fetch(`${BACKEND_URL}${path}`, { ...options, headers });
}

/**
 * The single place the app talks to the backend.
 *
 * NestJS returns the handler's return value as the response body directly —
 * there is no `{ success, data }` envelope like the old Express backend sent,
 * so there is nothing to unwrap. Errors come back as Nest's exception shape:
 *   { statusCode: 400, message: "..." | ["...", "..."], error: "Bad Request" }
 * `message` is an ARRAY when class-validator rejects a DTO (one string per
 * failed constraint), which is why it is joined rather than assumed a string.
 */
export async function apiFetchJson<T = unknown>(
  path: string,
  options: RequestInit = {},
): Promise<T> {
  const res = await apiFetch(path, options);
  const text = await res.text();

  // 204 and friends have no body — returning undefined is correct, and
  // JSON.parse("") would throw.
  if (!text) {
    if (!res.ok) {
      throw new ApiError(res.statusText || "Request failed", res.status);
    }
    return undefined as T;
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    if (text.trimStart().startsWith("<")) {
      throw new Error(
        "Server unavailable — check that the LOMAH backend is running.",
      );
    }
    throw new Error(`Unexpected server response (${res.status})`);
  }

  if (!res.ok) {
    throw new ApiError(extractErrorMessage(parsed, res), res.status);
  }

  return parsed as T;
}

function extractErrorMessage(parsed: unknown, res: Response): string {
  if (parsed && typeof parsed === "object" && "message" in parsed) {
    const message = (parsed as { message: unknown }).message;
    if (Array.isArray(message)) return message.join("; ");
    if (typeof message === "string") return message;
  }
  return res.statusText || "Request failed";
}

/** Convenience wrappers — every call site was hand-building method + headers. */
export const api = {
  get: <T>(path: string) => apiFetchJson<T>(`${API_PREFIX}${path}`),

  post: <T>(path: string, body?: unknown) =>
    apiFetchJson<T>(`${API_PREFIX}${path}`, {
      method: "POST",
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    }),

  patch: <T>(path: string, body?: unknown) =>
    apiFetchJson<T>(`${API_PREFIX}${path}`, {
      method: "PATCH",
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    }),

  delete: <T>(path: string) =>
    apiFetchJson<T>(`${API_PREFIX}${path}`, { method: "DELETE" }),
};

// ── Server clock alignment ───────────────────────────────────────────────────
// Session timers are driven by a startedAt issued by the admin machine, but each
// device ticks them against its own clock. Range PCs are rarely NTP-synced, so
// without correcting for the difference the admin and shooter countdowns drift
// apart by exactly however far the two clocks disagree.
let serverClockSkewMs = 0;

/** Now, expressed on the admin/server clock rather than this device's clock. */
export function serverNow(): number {
  return Date.now() + serverClockSkewMs;
}

/** Measure this device's offset from the server clock. Safe to call repeatedly
 *  (e.g. on every socket reconnect); a failure leaves the last known skew. */
export async function syncServerClock(): Promise<void> {
  try {
    const sentAt = Date.now();
    // /health sits OUTSIDE the /api prefix (see main.ts) and is @Public, so no
    // token is needed — which matters, because this runs before login.
    const res = await fetch(`${BACKEND_URL}/health`);
    const receivedAt = Date.now();
    const body = (await res.json()) as { serverTime?: string };
    const serverTime = body?.serverTime;
    if (typeof serverTime !== "string") return;
    const serverMs = new Date(serverTime).getTime();
    if (!Number.isFinite(serverMs)) return;
    // Assume the server read its clock at the midpoint of the round trip.
    const midpoint = sentAt + (receivedAt - sentAt) / 2;
    serverClockSkewMs = serverMs - midpoint;
    if (Math.abs(serverClockSkewMs) >= 1000) {
      console.warn(
        `[Clock] This device is ${(serverClockSkewMs / 1000).toFixed(1)}s ` +
          `${serverClockSkewMs > 0 ? "behind" : "ahead of"} the admin PC — ` +
          `session timers are corrected for it. Sync both clocks to remove the gap.`,
      );
    }
  } catch {
    // Offline or backend down — keep whatever skew we already had.
  }
}

/**
 * Time left on a STAGE. Stages carry the clock now, not the session: each has
 * its own startedAt and durationSeconds, while totalPausedMs is tracked on the
 * parent session (a pause suspends whichever stage is active).
 */
export function formatTimeRemaining(
  stageStartedAt: string | null | undefined,
  durationSeconds: number,
  totalPausedMs: number = 0,
): string {
  if (!stageStartedAt) return "--:--";
  const elapsed = Math.floor(
    (serverNow() - new Date(stageStartedAt).getTime() - totalPausedMs) / 1000,
  );
  const left = Math.max(0, durationSeconds - elapsed);
  const m = Math.floor(left / 60);
  const s = left % 60;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

export { API_PREFIX };
