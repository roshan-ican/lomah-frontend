export const DEFAULT_ADMIN_PORT = 3001;

export type AdminEndpoint = { host: string; port: number };

export function normalizeHost(ip: string): string {
  return ip.replace(/^.*:/, "").trim();
}

export async function probeLocalAdmin(
  port = DEFAULT_ADMIN_PORT,
): Promise<AdminEndpoint | null> {
  try {
    const res = await fetch(`http://127.0.0.1:${port}/health`, {
      signal: AbortSignal.timeout(2500),
    });
    if (res.ok) return { host: "127.0.0.1", port };
  } catch {
    /* no local admin */
  }
  return null;
}
