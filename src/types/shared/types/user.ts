
export type UserRole = "SUPER_ADMIN" | "ADMIN" | "SHOOTER";

export interface User {
  id: string;
  username: string;
  role: UserRole;
}

/** POST /auth/login response. */
export interface LoginResponse {
  accessToken: string;
  user: User;
}

/** A shooter tablet that has announced itself via POST /auth/connect.
 *  Not an account — no credentials, nothing persisted but the lane binding. */
export interface ConnectedShooter {
  /** deviceId if the tablet sent one, otherwise its IP. */
  key: string;
  ip: string;
  deviceId: string | null;
  /** Null until an admin assigns this device to a lane. */
  laneId: number | null;
  connectedAt: string;
}
