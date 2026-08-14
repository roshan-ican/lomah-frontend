
import type { TargetProfileType } from "../coordinates";

export type { TargetProfileType };

export type LaneStatus = "AVAILABLE" | "OCCUPIED" | "MAINTENANCE" | "DISABLED";

export interface Target {
  id: string;
  laneId: number;
  label: string;
  distanceM: number;
  positionIndex: number;
  ipAddress: string;
  /** Where PLAY/STOP are unicast when it is not `ipAddress` — a simulated or
   *  container target answers from its bridge IP but is commanded through a
   *  published loopback port. Null means "send to `ipAddress`". */
  commandHost: string | null;
  /** Port override for command unicasts. Null means the transport default
   *  (14550). */
  commandPort: number | null;
  deviceId: string | null;
  offsetXmm: number;
  offsetYmm: number;
  profileType: TargetProfileType;
  lastSeenAt: string | null;
  rssi: number | null;
  firmwareVersion: string;
  createdAt: string;
  updatedAt: string;
}

/** What the device's own 'T' self-test reported.
 *  - PASSED / FAILED: it was armed and ran the check.
 *  - NOT_ARMED: it answered but reported it was in STOP mode — should not
 *    happen right after a successful PLAY, worth a retest.
 *  - NO_ANSWER: it never answered at all (PLAY or the test itself). */
export type SelfTestOutcome = "PASSED" | "FAILED" | "NOT_ARMED" | "NO_ANSWER";

/** A single live UDP frame exchange against a target board: the exact bytes
 *  that went out and, when the board answered, the exact bytes that came back.
 *  Every live command endpoint returns one of these so the admin console's
 *  packet log can show real wire traffic rather than a reconstruction. */
export interface TargetFrameExchange {
  targetId: string;
  label: string;
  ipAddress: string;
  /** ASCII command byte that was sent — P/S/T/H/D/G/W. */
  command: string;
  /** True if the board answered the request within budget. For STOP (which is
   *  fire-and-forget at the transport) this reports whether an echo arrived,
   *  not whether the disarm happened — the frame went out regardless. */
  ok: boolean;
  /** The exact 9-byte frame sent, space-separated uppercase hex. */
  txHex: string;
  /** The board's reply frame, space-separated uppercase hex, or null if it
   *  never answered within budget. */
  rxHex: string | null;
  /** Human-readable summary, including what to check on failure. */
  message: string;
}

/**
 * POST /targets/:id/self-test.
 *
 * `ok` means the device's timing circuit itself passed ('T' — see
 * SelfTestOutcome) — a stronger claim than earlier versions of this endpoint
 * made, which only checked that the board echoed PLAY (reachability, not
 * correctness).
 */
export interface TargetSelfTestResult extends TargetFrameExchange {
  /** True only if the device's timing circuit itself passed ('T'). */
  ok: boolean;
  outcome: SelfTestOutcome;
  /** Signed millimetres of the test stimulus. ~-150 on a real pass. Null
   *  unless the board actually ran the test (PASSED or FAILED). */
  xMm: number | null;
  /** Signed millimetres of the test stimulus. ~600 on a real pass. */
  yMm: number | null;
  testedAt: string;
  /** Human-readable outcome, including what to check when it failed. */
  message: string;
}

/**
 * POST /targets/:id/play — sends PLAY and waits for the board to echo it.
 * `armed` is `true` only if the echo arrived within budget.
 */
export interface TargetPlayResult extends TargetFrameExchange {
  armed: boolean;
}

/**
 * POST /targets/:id/stop — sends STOP and waits for the echo (the board
 * confirms receipt). `disarmed` reflects what was requested; see
 * TargetFrameExchange.ok for whether the board actually confirmed it.
 */
export interface TargetStopResult extends TargetFrameExchange {
  disarmed: boolean;
}

/** POST /targets/:id/heartbeat — sends 'H' and reports whether it was echoed. */
export interface TargetHeartbeatResult extends TargetFrameExchange {}

/** POST /targets/:id/dev-data — 'D', which of the board's 8 sensors detected
 *  the requested shot. */
export interface TargetDevDataResult extends TargetFrameExchange {
  /** Bitmask L4 L3 L2 L1 R4 R3 R2 R1 (bit 0 = R1) as the board reported it, or
   *  null if the board never answered. */
  sensors: number | null;
}


export interface TargetReadShotResult extends TargetFrameExchange {
  shot: number;
  echoed: boolean;
  noDetection: boolean;
  elapsedMs: number | null;
  rawX: number | null;
  rawY: number | null;
  xMm: number | null;
  yMm: number | null;
  score: number | null;
}

export type WiperPage = "A" | "B";

/**
 * One page's five sensitivity trimmers ("wiper positions"), read or written
 * live off the board — never persisted, since the board is the only source
 * of truth for these values.
 *
 * Wiper→physical-sensor mapping is NOT documented: there are 5 trimmers per
 * page × 2 pages = 10 channels, and the device's separate diagnostic ('D')
 * reports 8 sensors (L1-L4, R1-R4) — the counts do not even match. Channels
 * are therefore addressed only as A1..A5 / B1..B5, never as "left sensor" or
 * similar, anywhere this type is displayed.
 */
export interface WiperPageValues {
  targetId: string;
  page: WiperPage;
  /** Length 5, each 0-255, wipers 1-5 in array order. */
  values: number[];
  readAt: string;
  /** The 'G'/'W' round trip that produced these values, for the packet log. */
  txHex: string;
  /** The board's reply frame, or null — a read that failed never returns
   *  values, so this is normally the echoed frame. */
  rxHex: string | null;
}

export interface Lane {
  id: number;
  name: string;
  siteName: string;
  status: LaneStatus;
  activeTargetId: string | null;
  targets?: Target[];
  createdAt: string;
  updatedAt: string;
}
