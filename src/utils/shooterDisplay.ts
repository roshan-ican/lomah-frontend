const PLACEHOLDER_NAMES = new Set([
  "Vacant Lane",
  "Guest Shooter",
  "Unassigned",
]);

export function shooterDisplayName(
  name: string | undefined,
  opId: string | undefined,
  fallback = "Unassigned",
): string {
  const trimmedName = name?.trim();
  const trimmedOpId = opId?.trim();

  if (trimmedName && !PLACEHOLDER_NAMES.has(trimmedName)) {
    if (
      trimmedOpId &&
      trimmedOpId !== "VACANT" &&
      trimmedOpId !== "GUEST" &&
      trimmedOpId.toLowerCase() !== trimmedName.toLowerCase()
    ) {
      return `${trimmedName} (${trimmedOpId})`;
    }
    return trimmedName;
  }

  if (trimmedOpId && trimmedOpId !== "VACANT" && trimmedOpId !== "GUEST") {
    return trimmedOpId;
  }

  return fallback;
}
