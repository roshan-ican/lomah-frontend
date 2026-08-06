// How the range is addressed and labelled, in one place.
//
// ONE router, ONE flat subnet, for the whole range. Every board — every lane's
// targets — sits on it and is reached from the single host running the server.
//
// The last octet encodes where a board physically is: `laneId * 10 + slot`.
// So 10.0.1.11 is lane 1 slot 1 and 10.0.1.42 is lane 4 slot 2, which means an
// address read off a board in the field says which lane and which position it
// belongs to without opening the database. That is only possible because the
// range is one subnet; the earlier 10.0.<laneId>.<n> scheme assumed a subnet
// per lane, which is not how the range is wired.
//
// Nothing here is ever typed by an operator. An address is a CONSEQUENCE of
// choosing a lane and a slot, so it cannot drift out of convention, collide
// with another board, or be fat-fingered into a different lane's block.

export const RANGE_SUBNET = "192.168.4";

/** The bench board's real address. The FIRST target commissioned on a clean
 *  range gets this IP instead of a derived one — it is the one board physically
 *  on the Wi-Fi network right now (192.168.4.1 is its router), and a derived
 *  192.168.4.x address would point at nothing. Targets added after it follow
 *  the lane/slot scheme again. */
export const DEFAULT_TARGET_IP = "192.168.4.2";

/** `laneId * 10 + slot` has to stay inside one octet, and slot is 1-based. */
export const MAX_SLOTS_PER_LANE = 9;
export const MAX_ADDRESSABLE_LANE = 24; // 24 * 10 + 9 = 249

/** Where a target can be mounted. Another distance means adding a preset, not
 *  a free-text field — the range's firing points are fixed. */
export const DISTANCE_PRESETS_M = [25, 50, 100, 200, 300, 500] as const;

/** Lane 1 -> A, lane 26 -> Z, lane 27 -> AA. */
export function laneLetter(laneId: number): string {
  let n = laneId - 1;
  let out = "";
  do {
    out = String.fromCharCode(65 + (n % 26)) + out;
    n = Math.floor(n / 26) - 1;
  } while (n >= 0);
  return out;
}

/** The mounting position as it is painted on the frame downrange: "A1", "B2". */
export const slotCode = (laneId: number, positionIndex: number) =>
  `${laneLetter(laneId)}${positionIndex + 1}`;

export const addressFor = (laneId: number, positionIndex: number) =>
  `${RANGE_SUBNET}.${laneId * 10 + positionIndex + 1}`;

/** Derived, not typed: a target's name IS its distance. */
export const labelFor = (distanceM: number) => `${distanceM}M`;
