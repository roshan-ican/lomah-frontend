import { useCallback, useEffect, useMemo, useState } from "react";
import {
  CalendarClock,
  Check,
  Clock3,
  Pencil,
  Plus,
  RefreshCw,
  Trash2,
  UserPlus,
  X,
} from "lucide-react";

import type {
  Lane,
  LaneScheduleAttendeeInput,
  LaneScheduleInput,
  LaneScheduleView as LaneScheduleRecord,
  OwnedLaneSchedule,
  Shooter,
} from "../../../types";
import { api, ApiError } from "../../../utils/api";
import { ConfirmDialog } from "../../../components/common/ConfirmDialog";

interface Props {
  isAr: boolean;
  availableShooters: Shooter[];
  triggerSuccessBanner: (message: string) => void;
  triggerErrorBanner: (message: string) => void;
}

function localDateValue(date = new Date()): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function localTimeValue(value: string): string {
  const date = new Date(value);
  return `${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
}

function dayRange(dateValue: string): { from: string; to: string } {
  const from = new Date(`${dateValue}T00:00:00`);
  const to = new Date(from);
  to.setDate(to.getDate() + 1);
  return { from: from.toISOString(), to: to.toISOString() };
}

function errorMessage(error: unknown): string {
  if (error instanceof ApiError || error instanceof Error) return error.message;
  return "Request failed";
}

export function LaneScheduleView({
  isAr,
  availableShooters,
  triggerSuccessBanner,
  triggerErrorBanner,
}: Props) {
  const [dateValue, setDateValue] = useState(localDateValue);
  const [lanes, setLanes] = useState<Lane[]>([]);
  const [schedules, setSchedules] = useState<LaneScheduleRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<OwnedLaneSchedule | null>(null);
  const [laneId, setLaneId] = useState("");
  const [startTime, setStartTime] = useState("07:00");
  const [endTime, setEndTime] = useState("08:00");
  const [selectedShooterIds, setSelectedShooterIds] = useState<string[]>([]);
  const [manualName, setManualName] = useState("");
  const [manualNames, setManualNames] = useState<string[]>([]);
  const [preservedExternal, setPreservedExternal] = useState<
    LaneScheduleAttendeeInput[]
  >([]);
  const [saving, setSaving] = useState(false);
  const [cancellingId, setCancellingId] = useState<string | null>(null);
  const [pendingCancel, setPendingCancel] =
    useState<OwnedLaneSchedule | null>(null);

  const loadLanes = useCallback(async () => {
    try {
      const rows = await api.get<Lane[]>("/lanes");
      setLanes(Array.isArray(rows) ? rows : []);
      setLaneId((current) => current || String(rows[0]?.id ?? ""));
    } catch (error) {
      triggerErrorBanner(errorMessage(error));
    }
  }, [triggerErrorBanner]);

  const loadSchedules = useCallback(async () => {
    setLoading(true);
    try {
      const range = dayRange(dateValue);
      const query = new URLSearchParams(range).toString();
      const rows = await api.get<LaneScheduleRecord[]>(
        `/lane-schedules?${query}`,
      );
      setSchedules(Array.isArray(rows) ? rows : []);
    } catch (error) {
      triggerErrorBanner(errorMessage(error));
      setSchedules([]);
    } finally {
      setLoading(false);
    }
  }, [dateValue, triggerErrorBanner]);

  useEffect(() => {
    void loadLanes();
  }, [loadLanes]);

  useEffect(() => {
    void loadSchedules();
  }, [loadSchedules]);

  useEffect(() => {
    const refresh = () => void loadSchedules();
    window.addEventListener("lomah:lane-schedule-changed", refresh);
    return () =>
      window.removeEventListener("lomah:lane-schedule-changed", refresh);
  }, [loadSchedules]);

  const schedulesByLane = useMemo(
    () =>
      lanes.map((lane) => ({
        lane,
        schedules: schedules.filter((schedule) => schedule.laneId === lane.id),
      })),
    [lanes, schedules],
  );

  const resetForm = () => {
    setEditing(null);
    setShowForm(false);
    setLaneId(String(lanes[0]?.id ?? ""));
    setStartTime("07:00");
    setEndTime("08:00");
    setSelectedShooterIds([]);
    setManualName("");
    setManualNames([]);
    setPreservedExternal([]);
  };

  const beginEdit = (schedule: OwnedLaneSchedule) => {
    setEditing(schedule);
    setShowForm(true);
    setDateValue(localDateValue(new Date(schedule.startsAt)));
    setLaneId(String(schedule.laneId));
    setStartTime(localTimeValue(schedule.startsAt));
    setEndTime(localTimeValue(schedule.endsAt));
    setSelectedShooterIds(
      schedule.attendees
        .filter((row) => row.identitySource === "LOCAL" && row.shooterId)
        .map((row) => row.shooterId as string),
    );
    setManualNames(
      schedule.attendees
        .filter(
          (row) =>
            row.identitySource === "MANUAL" ||
            (row.identitySource === "LOCAL" && !row.shooterId),
        )
        .map((row) => row.displayName),
    );
    setPreservedExternal(
      schedule.attendees
        .filter((row) => row.identitySource === "EXTERNAL")
        .map((row) => ({
          identitySource: "EXTERNAL" as const,
          displayName: row.displayName,
          externalProvider: row.externalProvider ?? undefined,
          externalId: row.externalId ?? undefined,
        })),
    );
  };

  const toggleShooter = (id: string) => {
    setSelectedShooterIds((current) =>
      current.includes(id)
        ? current.filter((value) => value !== id)
        : [...current, id],
    );
  };

  const addManualName = () => {
    const name = manualName.trim();
    if (!name) return;
    if (
      manualNames.some(
        (existing) => existing.toLocaleLowerCase() === name.toLocaleLowerCase(),
      )
    ) {
      triggerErrorBanner(
        isAr ? "تمت إضافة هذا الاسم بالفعل." : "That name is already added.",
      );
      return;
    }
    setManualNames((current) => [...current, name]);
    setManualName("");
  };

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    const parsedLaneId = Number(laneId);
    const attendees: LaneScheduleAttendeeInput[] = [
      ...selectedShooterIds.map((shooterId) => ({
        identitySource: "LOCAL" as const,
        shooterId,
      })),
      ...manualNames.map((displayName) => ({
        identitySource: "MANUAL" as const,
        displayName,
      })),
      ...preservedExternal,
    ];
    if (!Number.isInteger(parsedLaneId) || attendees.length === 0) {
      triggerErrorBanner(
        isAr
          ? "اختر حارة وأضف رامياً واحداً على الأقل."
          : "Choose a lane and add at least one shooter.",
      );
      return;
    }

    const startsAt = new Date(`${dateValue}T${startTime}:00`);
    const endsAt = new Date(`${dateValue}T${endTime}:00`);
    if (startsAt >= endsAt) {
      triggerErrorBanner(
        isAr
          ? "يجب أن يكون وقت الانتهاء بعد وقت البدء."
          : "End time must be after start time.",
      );
      return;
    }

    const payload: LaneScheduleInput = {
      laneId: parsedLaneId,
      startsAt: startsAt.toISOString(),
      endsAt: endsAt.toISOString(),
      attendees,
    };

    setSaving(true);
    try {
      if (editing) {
        await api.patch(`/lane-schedules/${editing.id}`, payload);
        triggerSuccessBanner(
          isAr ? "تم تحديث الجدول." : "Schedule updated.",
        );
      } else {
        await api.post("/lane-schedules", payload);
        triggerSuccessBanner(
          isAr ? "تمت جدولة الحارة." : "Lane scheduled.",
        );
      }
      resetForm();
      await loadSchedules();
    } catch (error) {
      triggerErrorBanner(errorMessage(error));
    } finally {
      setSaving(false);
    }
  };

  const cancelSchedule = async (schedule: OwnedLaneSchedule) => {
    setCancellingId(schedule.id);
    try {
      await api.post(`/lane-schedules/${schedule.id}/cancel`);
      triggerSuccessBanner(
        isAr ? "تم إلغاء الجدول." : "Schedule cancelled.",
      );
      await loadSchedules();
    } catch (error) {
      triggerErrorBanner(errorMessage(error));
    } finally {
      setCancellingId(null);
      setPendingCancel(null);
    }
  };

  const timeFormatter = useMemo(
    () =>
      new Intl.DateTimeFormat(isAr ? "ar-AE" : "en-AE", {
        hour: "2-digit",
        minute: "2-digit",
      }),
    [isAr],
  );

  return (
    <div className="flex-1 min-h-0 overflow-y-auto p-4 md:p-6">
      <div className="max-w-7xl mx-auto space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <CalendarClock className="w-5 h-5 hud-accent" />
              <h2 className="admin-text-lg font-semibold hud-text">
                {isAr ? "جدول الحارات" : "Lane Schedule"}
              </h2>
            </div>
            <p className="admin-text-2xs font-mono hud-text-muted mt-1">
              {isAr
                ? "تفاصيل مجموعتك خاصة. تظهر حجوزات الآخرين كحارة مشغولة فقط."
                : "Your group details stay private. Other reservations appear only as Busy."}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <input
              type="date"
              value={dateValue}
              onChange={(event) => setDateValue(event.target.value)}
              className="hud-form-input rounded px-3 py-2 admin-text-sm font-mono"
            />
            <button
              type="button"
              onClick={() => void loadSchedules()}
              className="hud-btn-secondary p-2 rounded-lg cursor-pointer"
              aria-label={isAr ? "تحديث" : "Refresh"}
            >
              <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
            </button>
            <button
              type="button"
              onClick={() => {
                if (showForm) resetForm();
                else setShowForm(true);
              }}
              className="hud-btn-primary px-3 py-2 rounded-lg admin-text-xs font-mono font-bold inline-flex items-center gap-1.5 cursor-pointer"
            >
              {showForm ? <X className="w-4 h-4" /> : <Plus className="w-4 h-4" />}
              {showForm
                ? isAr
                  ? "إغلاق"
                  : "Close"
                : isAr
                  ? "جدولة حارة"
                  : "Schedule Lane"}
            </button>
          </div>
        </div>

        {showForm && (
          <form
            onSubmit={submit}
            className="rounded-xl border border-hud bg-hud-elevated p-4 md:p-5 space-y-4"
          >
            <div className="flex items-center justify-between">
              <h3 className="admin-text-base font-semibold hud-text">
                {editing
                  ? isAr
                    ? "تعديل الجدول"
                    : "Edit Schedule"
                  : isAr
                    ? "جدولة جديدة"
                    : "New Schedule"}
              </h3>
              <span className="hud-label hud-text-muted">
                {isAr ? "حقول بسيطة — بدون تشغيل تلقائي" : "No automatic firing"}
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
              <label className="space-y-1">
                <span className="hud-label hud-text-muted">{isAr ? "الحارة" : "Lane"}</span>
                <select
                  value={laneId}
                  onChange={(event) => setLaneId(event.target.value)}
                  className="hud-form-input w-full rounded px-3 py-2 admin-text-sm font-mono"
                  required
                >
                  <option value="">{isAr ? "اختر" : "Select"}</option>
                  {lanes.map((lane) => (
                    <option key={lane.id} value={lane.id}>
                      {lane.name || `${isAr ? "الحارة" : "Lane"} ${lane.id}`}
                    </option>
                  ))}
                </select>
              </label>
              <label className="space-y-1">
                <span className="hud-label hud-text-muted">{isAr ? "التاريخ" : "Date"}</span>
                <input
                  type="date"
                  value={dateValue}
                  onChange={(event) => setDateValue(event.target.value)}
                  className="hud-form-input w-full rounded px-3 py-2 admin-text-sm font-mono"
                  required
                />
              </label>
              <label className="space-y-1">
                <span className="hud-label hud-text-muted">{isAr ? "من" : "Start"}</span>
                <input
                  type="time"
                  value={startTime}
                  onChange={(event) => setStartTime(event.target.value)}
                  className="hud-form-input w-full rounded px-3 py-2 admin-text-sm font-mono"
                  required
                />
              </label>
              <label className="space-y-1">
                <span className="hud-label hud-text-muted">{isAr ? "إلى" : "End"}</span>
                <input
                  type="time"
                  value={endTime}
                  onChange={(event) => setEndTime(event.target.value)}
                  className="hud-form-input w-full rounded px-3 py-2 admin-text-sm font-mono"
                  required
                />
              </label>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <div>
                <p className="hud-label hud-text-muted mb-2">
                  {isAr ? "الرماة المسجلون" : "Registered Shooters"}
                </p>
                <div className="max-h-44 overflow-y-auto rounded-lg border border-hud p-2 space-y-1">
                  {availableShooters.length === 0 ? (
                    <p className="admin-text-xs font-mono hud-text-muted p-2">
                      {isAr ? "لا يوجد رماة مسجلون." : "No registered shooters."}
                    </p>
                  ) : (
                    availableShooters.map((shooter) => {
                      const selected = selectedShooterIds.includes(shooter.id);
                      return (
                        <button
                          key={shooter.id}
                          type="button"
                          onClick={() => toggleShooter(shooter.id)}
                          className={`w-full flex items-center justify-between px-3 py-2 rounded admin-text-xs font-mono cursor-pointer ${
                            selected
                              ? "bg-[var(--hud-accent-bg-subtle)] hud-accent"
                              : "hud-text-secondary hover:bg-[var(--hud-accent-bg-subtle)]"
                          }`}
                        >
                          <span>{shooter.name}</span>
                          {selected && <Check className="w-4 h-4" />}
                        </button>
                      );
                    })
                  )}
                </div>
              </div>

              <div>
                <p className="hud-label hud-text-muted mb-2">
                  {isAr ? "أسماء مؤقتة" : "Manual Names"}
                </p>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={manualName}
                    onChange={(event) => setManualName(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter") {
                        event.preventDefault();
                        addManualName();
                      }
                    }}
                    placeholder={isAr ? "اكتب الاسم" : "Type a temporary name"}
                    className="hud-form-input flex-1 rounded px-3 py-2 admin-text-sm font-mono"
                  />
                  <button
                    type="button"
                    onClick={addManualName}
                    className="hud-btn-secondary px-3 rounded-lg cursor-pointer"
                  >
                    <UserPlus className="w-4 h-4" />
                  </button>
                </div>
                <div className="flex flex-wrap gap-2 mt-2">
                  {manualNames.map((name) => (
                    <span
                      key={name.toLocaleLowerCase()}
                      className="inline-flex items-center gap-1.5 rounded-full border border-hud px-2.5 py-1 admin-text-2xs font-mono hud-text-secondary"
                    >
                      {name}
                      <button
                        type="button"
                        onClick={() =>
                          setManualNames((current) =>
                            current.filter((value) => value !== name),
                          )
                        }
                        className="cursor-pointer hover:hud-danger"
                        aria-label={`${isAr ? "إزالة" : "Remove"} ${name}`}
                      >
                        <X className="w-3 h-3" />
                      </button>
                    </span>
                  ))}
                </div>
              </div>
            </div>

            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={resetForm}
                className="hud-btn-secondary px-4 py-2 rounded-lg admin-text-xs font-mono cursor-pointer"
              >
                {isAr ? "إلغاء" : "Cancel"}
              </button>
              <button
                type="submit"
                disabled={saving}
                className="hud-btn-primary px-4 py-2 rounded-lg admin-text-xs font-mono font-bold cursor-pointer disabled:opacity-50"
              >
                {saving
                  ? isAr
                    ? "جارٍ الحفظ..."
                    : "Saving..."
                  : editing
                    ? isAr
                      ? "حفظ التعديلات"
                      : "Save Changes"
                    : isAr
                      ? "حفظ الجدول"
                      : "Save Schedule"}
              </button>
            </div>
          </form>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
          {schedulesByLane.map(({ lane, schedules: laneSchedules }) => (
            <section
              key={lane.id}
              className="rounded-xl border border-hud bg-hud-elevated overflow-hidden"
            >
              <div className="flex items-center justify-between px-4 py-3 border-b border-hud">
                <div>
                  <h3 className="admin-text-base font-semibold hud-text">
                    {lane.name || `${isAr ? "الحارة" : "Lane"} ${lane.id}`}
                  </h3>
                  <p className="admin-text-2xs font-mono hud-text-muted">
                    {laneSchedules.length === 0
                      ? isAr
                        ? "متاحة طوال اليوم"
                        : "Available all day"
                      : isAr
                        ? `${laneSchedules.length} فترة مجدولة`
                        : `${laneSchedules.length} scheduled period(s)`}
                  </p>
                </div>
                <span
                  className={`w-2.5 h-2.5 rounded-full ${
                    laneSchedules.length ? "bg-amber-500" : "bg-emerald-500"
                  }`}
                />
              </div>

              <div className="p-3 space-y-2">
                {laneSchedules.length === 0 ? (
                  <div className="py-5 text-center admin-text-xs font-mono hud-text-muted">
                    {isAr ? "لا توجد فترات مشغولة." : "No busy periods."}
                  </div>
                ) : (
                  laneSchedules.map((schedule) => {
                    const owned = schedule.access === "OWNER";
                    const finished = new Date(schedule.endsAt).getTime() <= Date.now();
                    return (
                      <article
                        key={schedule.id}
                        className={`rounded-lg border p-3 ${
                          owned
                            ? "border-[var(--hud-primary-border)] bg-[var(--hud-accent-bg-subtle)]"
                            : "border-hud bg-hud-rail"
                        }`}
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <div className="flex items-center gap-1.5 admin-text-sm font-mono font-bold hud-text">
                              <Clock3 className="w-3.5 h-3.5" />
                              {timeFormatter.format(new Date(schedule.startsAt))}
                              <span className="hud-text-muted">–</span>
                              {timeFormatter.format(new Date(schedule.endsAt))}
                            </div>
                            <p className={`mt-1 hud-label ${owned ? "hud-accent" : "hud-warning"}`}>
                              {owned
                                ? isAr
                                  ? "جدولي"
                                  : "My Schedule"
                                : isAr
                                  ? "مشغولة"
                                  : "Busy"}
                            </p>
                          </div>
                          {owned && !finished && (
                            <div className="flex items-center gap-1">
                              <button
                                type="button"
                                onClick={() => beginEdit(schedule)}
                                className="hud-btn-secondary p-1.5 rounded cursor-pointer"
                                aria-label={isAr ? "تعديل" : "Edit"}
                              >
                                <Pencil className="w-3.5 h-3.5" />
                              </button>
                              <button
                                type="button"
                                onClick={() => setPendingCancel(schedule)}
                                disabled={cancellingId === schedule.id}
                                className="hud-btn-warn p-1.5 rounded cursor-pointer disabled:opacity-50"
                                aria-label={isAr ? "إلغاء" : "Cancel"}
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          )}
                        </div>

                        {owned && (
                          <div className="mt-3 pt-2 border-t border-hud flex flex-wrap gap-1.5">
                            {schedule.attendees.map((attendee) => (
                              <span
                                key={attendee.id}
                                className="rounded-full border border-hud px-2 py-1 admin-text-2xs font-mono hud-text-secondary"
                              >
                                {attendee.displayName}
                              </span>
                            ))}
                          </div>
                        )}
                      </article>
                    );
                  })
                )}
              </div>
            </section>
          ))}
        </div>
      </div>
      <ConfirmDialog
        open={pendingCancel !== null}
        title={isAr ? "إلغاء الجدول؟" : "Cancel schedule?"}
        message={
          isAr
            ? "ستصبح الحارة متاحة للآخرين خلال هذه الفترة."
            : "The lane will become available to other admins during this period."
        }
        language={isAr ? "ar" : "en"}
        confirmLabel={isAr ? "إلغاء الجدول" : "Cancel Schedule"}
        onConfirm={() => {
          if (pendingCancel) void cancelSchedule(pendingCancel);
        }}
        onCancel={() => setPendingCancel(null)}
      />
    </div>
  );
}
