
export type UserRole = "SUPER_ADMIN" | "ADMIN" | "SHOOTER";

export interface User {
  id: string;
  username: string;
  role: UserRole;
}

export interface LoginResponse {
  accessToken: string;
  user: User;
}

export interface ConnectedShooter {
  key: string;
  ip: string;
  deviceId: string | null;
  laneId: number | null;
  connectedAt: string;
}

export interface AdminSummary {
  id: string;
  username: string;
  role: Exclude<UserRole, "SHOOTER">;
  createdAt: string;
}

export interface CreateAdminRequest {
  username: string;
  password: string;
}
