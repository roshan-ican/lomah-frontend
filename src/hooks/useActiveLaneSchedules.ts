import { useCallback, useEffect, useMemo, useState } from "react";

import type { LaneScheduleView } from "../types";
import { api, serverNow } from "../utils/api";

function localDayRange(timestamp: number): { from: string; to: string } {
  const from = new Date(timestamp);
  from.setHours(0, 0, 0, 0);
  const to = new Date(from);
  to.setDate(to.getDate() + 1);
  return { from: from.toISOString(), to: to.toISOString() };
}

function localDayKey(timestamp: number): string {
  const date = new Date(timestamp);
  return `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;
}

/**
 * Keeps the Control tab aware of reservations that are active right now.
 * Schedule changes arrive over the existing realtime channel; the lightweight
 * clock is only for crossing a reservation's start/end boundary without a
 * page refresh.
 */
export function useActiveLaneSchedules(): LaneScheduleView[] {
  const [schedules, setSchedules] = useState<LaneScheduleView[]>([]);
  const [now, setNow] = useState(() => serverNow());

  const loadSchedules = useCallback(async () => {
    const range = localDayRange(serverNow());
    const query = new URLSearchParams(range).toString();
    const rows = await api.get<LaneScheduleView[]>(
      `/lane-schedules?${query}`,
    );
    setSchedules(Array.isArray(rows) ? rows : []);
  }, []);

  const dayKey = localDayKey(now);

  useEffect(() => {
    void loadSchedules().catch(() => setSchedules([]));
  }, [dayKey, loadSchedules]);

  useEffect(() => {
    const refresh = () => void loadSchedules().catch(() => undefined);
    window.addEventListener("lomah:lane-schedule-changed", refresh);
    return () =>
      window.removeEventListener("lomah:lane-schedule-changed", refresh);
  }, [loadSchedules]);

  useEffect(() => {
    const interval = window.setInterval(() => setNow(serverNow()), 15_000);
    return () => window.clearInterval(interval);
  }, []);

  return useMemo(
    () =>
      schedules.filter((schedule) => {
        const startsAt = new Date(schedule.startsAt).getTime();
        const endsAt = new Date(schedule.endsAt).getTime();
        return startsAt <= now && now < endsAt;
      }),
    [now, schedules],
  );
}
