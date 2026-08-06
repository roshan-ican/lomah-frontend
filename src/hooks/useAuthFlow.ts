// useAuthFlow — login, logout, device connect, and session restore.
//
// Two completely different entry paths, which the old backend blurred by
// giving shooters accounts:
//
//  - ADMIN / SUPER_ADMIN log in with a username and password and get a JWT.
//    SUPER_ADMIN commissions hardware; ADMIN runs sessions. Only one ADMIN may
//    be active at a time — a second login gets a 409 naming who holds the lock.
//
//  - SHOOTERS DO NOT LOG IN AT ALL. A shooter's tablet announces itself as a
//    DEVICE (POST /auth/connect), then waits for an admin to assign it a lane.
//    There are no shooter credentials to enter, and /auth/register and
//    /auth/shooter-login no longer exist on the backend.
//
// The main auth *stage* (which screen is showing) and loggedInUsername stay in
// App — they're read all over the app — so this hook receives their setters
// rather than owning them.

import { useEffect, useState } from "react";
import type { Dispatch, SetStateAction } from "react";
import type { AuthStage, ConnectedShooter, LoginResponse, Shooter } from "../types";
import { AUTH_STAGE_PATH } from "../types";
import { api, ApiError, clearAuthSession, setAuthSession } from "../utils/api";

type NavigateFn = (to: string, opts?: { replace?: boolean }) => void;

interface AuthFlowDeps {
  authStage: AuthStage;
  isAr: boolean;
  navigate: NavigateFn;
  setLoggedInUsername: Dispatch<SetStateAction<string>>;
  setShooterAssignedLaneId: Dispatch<SetStateAction<number | null>>;
  triggerSuccessBanner: (msg: string) => void;
  syncShooterAssignmentFromApi: (username: string) => Promise<void>;
}

/** Stable per-browser id so a tablet keeps its lane assignment across reloads
 *  and DHCP changes. Without one the backend can only track it by IP, which
 *  it forgets the moment the address changes. */
function getOrCreateDeviceId(): string {
  const KEY = "lomah_device_id";
  let id = localStorage.getItem(KEY);
  if (!id) {
    id = `tablet-${Math.random().toString(36).slice(2, 10)}`;
    localStorage.setItem(KEY, id);
  }
  return id;
}

export function useAuthFlow({
  authStage,
  isAr,
  navigate,
  setLoggedInUsername,
  setShooterAssignedLaneId,
  triggerSuccessBanner,
  syncShooterAssignmentFromApi,
}: AuthFlowDeps) {
  const [authError, setAuthError] = useState<string | null>(null);
  const [availableShooters, setAvailableShooters] = useState<Shooter[]>([]);

  const fetchAvailableShooters = async () => {
    try {
      // The roster lives under /shooters now — /auth/shooters is gone, because
      // the roster is scoring data, not an account list.
      const data = await api.get<Shooter[]>("/shooters");
      setAvailableShooters(Array.isArray(data) ? data : []);
    } catch (err) {
      if (
        err instanceof ApiError &&
        (err.statusCode === 401 || err.statusCode === 403)
      ) {
        navigate(AUTH_STAGE_PATH.LOGIN_ADMIN, { replace: true });
        setAuthError(
          isAr
            ? "انتهت الجلسة. سجّل الدخول مرة أخرى."
            : "Session expired. Please log in again.",
        );
        return;
      }
      console.error("Error fetching shooter roster:", err);
    }
  };

  // Restore a saved session on mount.
  useEffect(() => {
    const storedRole =
      localStorage.getItem("role") ||
      localStorage.getItem("lomah_profile_role");
    const token = localStorage.getItem("token");
    const username = localStorage.getItem("username");

    if ((storedRole === "ADMIN" || storedRole === "SUPER_ADMIN") && token) {
      navigate(AUTH_STAGE_PATH.ADMIN_BOARD, { replace: true });
    } else if (storedRole === "SHOOTER") {
      // A shooter device has no token to validate — it just re-announces
      // itself and picks up whatever lane it is currently assigned to.
      if (username) setLoggedInUsername(username);
      navigate(AUTH_STAGE_PATH.SHOOTER_BOARD, { replace: true });
      void connectShooterDevice();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Refresh the shooter roster when the admin board becomes active.
  useEffect(() => {
    if (authStage === "ADMIN_BOARD") void fetchAvailableShooters();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authStage]);

  const handleAdminLogin = async (username: string, password: string) => {
    if (!username.trim() || !password.trim()) {
      setAuthError(
        isAr
          ? "اسم المستخدم وكلمة المرور مطلوبان."
          : "Username and password required.",
      );
      return;
    }
    setAuthError(null);
    try {
      const data = await api.post<LoginResponse>("/auth/login", {
        username: username.trim(),
        password,
      });
      const { role } = data.user;
      if (role !== "ADMIN" && role !== "SUPER_ADMIN") {
        throw new Error("Operator credentials required.");
      }
      setAuthSession(data.accessToken, role, data.user.username);
      navigate(AUTH_STAGE_PATH.ADMIN_BOARD, { replace: true });
      void fetchAvailableShooters();
      triggerSuccessBanner(
        isAr ? "مرحباً بمركز التحكم." : "Range Control Center online.",
      );
    } catch (err: unknown) {
      // A 409 means another admin already holds the console — surface who,
      // rather than a generic failure.
      setAuthError(err instanceof Error ? err.message : "Login failed.");
    }
  };

  /**
   * Announce this device and pick up its lane assignment.
   *
   * Replaces the old shooter "login". Returns the assigned lane, or null while
   * the device is still waiting for an admin to assign one — the waiting state
   * is normal and expected, not an error.
   */
  const connectShooterDevice = async (): Promise<number | null> => {
    setAuthError(null);
    try {
      const entry = await api.post<ConnectedShooter>("/auth/connect", {
        deviceId: getOrCreateDeviceId(),
      });
      localStorage.setItem("role", "SHOOTER");
      localStorage.setItem("lomah_profile_role", "SHOOTER");

      if (entry.laneId != null) {
        setShooterAssignedLaneId(entry.laneId);
        localStorage.setItem("laneId", String(entry.laneId));
      } else {
        setShooterAssignedLaneId(null);
        localStorage.removeItem("laneId");
      }
      return entry.laneId;
    } catch (err: unknown) {
      setAuthError(
        err instanceof Error
          ? err.message
          : isAr
            ? "تعذّر الاتصال بالخادم."
            : "Cannot reach the range server.",
      );
      return null;
    }
  };

  /** Enter the shooter board. No credentials — the device just connects and
   *  waits to be assigned. */
  const handleShooterConnect = async () => {
    const laneId = await connectShooterDevice();
    navigate(AUTH_STAGE_PATH.SHOOTER_BOARD, { replace: true });
    triggerSuccessBanner(
      laneId != null
        ? isAr
          ? `تم التعيين للحارة ${laneId}`
          : `Assigned to Lane ${laneId}`
        : isAr
          ? "بانتظار تعيين الحارة من المشرف."
          : "Waiting for the range officer to assign a lane.",
    );
  };

  const handleLogout = async () => {
    // Releases the single-active-admin lock so the next operator can log in.
    // Best-effort: a failure here must not trap the user on a dead console.
    try {
      await api.post("/auth/logout");
    } catch {
      // Already expired or unreachable — clearing local state is what matters.
    }
    clearAuthSession();
    localStorage.removeItem("laneId");
    setLoggedInUsername("");
    setShooterAssignedLaneId(null);
    navigate(AUTH_STAGE_PATH.PORTAL, { replace: true });
    setAuthError(null);
    triggerSuccessBanner(
      isAr
        ? "تم قطع الاتصال بالبوابة الآمنة."
        : "Secure connection closed. Return to portal.",
    );
  };

  return {
    authError,
    setAuthError,
    availableShooters,
    refreshShooters: fetchAvailableShooters,
    handleAdminLogin,
    handleShooterConnect,
    connectShooterDevice,
    handleLogout,
  };
}
