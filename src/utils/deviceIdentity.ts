const DEVICE_ID_KEY = "lomah_device_id";

/**
 * Return one durable identity per browser profile.
 *
 * An IP address is not a device identity: a development proxy can make two
 * tablets appear to share an address, while DHCP can move one tablet between
 * addresses. localStorage remains stable across reloads and is independent on
 * separate physical devices.
 */
export function getOrCreateDeviceId(): string {
  const stored = localStorage.getItem(DEVICE_ID_KEY);
  if (stored) return stored;

  const suffix =
    typeof crypto.randomUUID === "function"
      ? crypto.randomUUID()
      : Math.random().toString(36).slice(2, 12);
  const deviceId = `tablet-${suffix}`;
  localStorage.setItem(DEVICE_ID_KEY, deviceId);
  return deviceId;
}
