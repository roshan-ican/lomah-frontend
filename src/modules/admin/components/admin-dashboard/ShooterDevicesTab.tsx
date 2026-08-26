import { useEffect, useState } from "react";
import {
  UserPlus,
  Pencil,
  Trash2,
  Check,
  X,
  ScanFace,
  LoaderCircle,
} from "lucide-react";
import type { Shooter } from "../../../../types";
import { api, ApiError } from "../../../../utils/api";
import { LaneAssignmentPanel } from "./LaneAssignmentPanel";

interface Props {
  isAr: boolean;
  availableShooters: Shooter[];
  refreshShooters: () => void;
  triggerSuccessBanner: (msg: string) => void;
  /** Failures. Rendered red with a warning icon — routing them through
   * triggerSuccessBanner produced a green checkmark on the word "Error". */
  triggerErrorBanner: (msg: string) => void;
}

interface AdminPreferences {
  faceRecognitionEnabled: boolean;
}

export function ShooterDevicesTab({
  isAr,
  availableShooters,
  refreshShooters,
  triggerSuccessBanner,
  triggerErrorBanner,
}: Props) {
  const [showAddForm, setShowAddForm] = useState(false);
  const [newUsername, setNewUsername] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [newRank, setNewRank] = useState("");
  const [newBadge, setNewBadge] = useState("");
  const [registering, setRegistering] = useState(false);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [editRank, setEditRank] = useState("");
  const [editBadge, setEditBadge] = useState("");
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [faceRecognitionEnabled, setFaceRecognitionEnabled] = useState<
    boolean | null
  >(null);
  const [savingFacePreference, setSavingFacePreference] = useState(false);

  useEffect(() => {
    let cancelled = false;
    api
      .get<AdminPreferences>("/users/me/preferences")
      .then((preferences) => {
        if (!cancelled) {
          setFaceRecognitionEnabled(preferences.faceRecognitionEnabled);
        }
      })
      .catch((error) => {
        if (!cancelled) {
          triggerErrorBanner(
            error instanceof Error
              ? error.message
              : isAr
                ? "تعذر تحميل إعداد التحقق من الهوية."
                : "Identity verification preference could not be loaded.",
          );
        }
      });
    return () => {
      cancelled = true;
    };
  }, [isAr, triggerErrorBanner]);

  const toggleFaceRecognition = async () => {
    if (faceRecognitionEnabled === null || savingFacePreference) return;

    const previous = faceRecognitionEnabled;
    const next = !previous;
    // Respond immediately; roll back only if the server rejects the change.
    setFaceRecognitionEnabled(next);
    setSavingFacePreference(true);
    try {
      await api.patch<AdminPreferences>("/users/me/preferences", {
        faceRecognitionEnabled: next,
      });
      triggerSuccessBanner(
        next
          ? isAr
            ? "تم تفعيل التحقق من الوجه للجلسات الجديدة."
            : "Face verification enabled for new sessions."
          : isAr
            ? "تم إيقاف التحقق من الوجه للجلسات الجديدة."
            : "Face verification disabled for new sessions.",
      );
    } catch (error) {
      setFaceRecognitionEnabled(previous);
      triggerErrorBanner(
        error instanceof Error
          ? error.message
          : isAr
            ? "تعذر حفظ إعداد التحقق من الهوية."
            : "Identity verification preference could not be saved.",
      );
    } finally {
      setSavingFacePreference(false);
    }
  };

  const handleAddShooter = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newUsername.trim()) return;
    setRegistering(true);
    try {
      // Roster entry, NOT an account — shooters never log in, so there is no
      // password to set. /auth/register no longer exists.
      await api.post("/shooters", {
        name: newUsername.trim(),
        rank: newRank.trim() || undefined,
        badgeNumber: newBadge.trim() || undefined,
      });
      triggerSuccessBanner(
        isAr
          ? `تم إضافة الرامي "${newUsername.trim()}" ✓`
          : `Shooter "${newUsername.trim()}" added ✓`,
      );
      setNewUsername("");
      setNewPassword("");
      setNewRank("");
      setNewBadge("");
      setShowAddForm(false);
      refreshShooters();
    } catch (err) {
      const msg =
        err instanceof ApiError
          ? err.message
          : err instanceof Error
            ? err.message
            : "Registration failed";
      triggerErrorBanner(msg);
    } finally {
      setRegistering(false);
    }
  };

  const startEdit = (s: Shooter) => {
    setEditingId(s.id);
    setEditName(s.name);
    setEditRank(s.rank ?? "");
    setEditBadge(s.badgeNumber ?? "");
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditName("");
    setEditRank("");
    setEditBadge("");
  };

  const handleSaveEdit = async (id: string) => {
    if (!editName.trim()) return;
    setSaving(true);
    try {
      // PATCH, not PUT — the backend exposes a partial update.
      await api.patch(`/shooters/${id}`, {
        name: editName.trim(),
        rank: editRank.trim() || undefined,
        badgeNumber: editBadge.trim() || undefined,
      });
      triggerSuccessBanner(
        isAr ? "تم تحديث بيانات الرامي ✓" : "Shooter updated ✓",
      );
      cancelEdit();
      refreshShooters();
    } catch (err) {
      const msg =
        err instanceof ApiError
          ? err.message
          : err instanceof Error
            ? err.message
            : "Update failed";
      triggerErrorBanner(msg);
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteShooter = async (id: string, name: string) => {
    setDeletingId(id);
    try {
      await api.delete(`/shooters/${id}`);
      triggerSuccessBanner(
        isAr ? `تم حذف الرامي "${name}" ✓` : `Shooter "${name}" deleted ✓`,
      );
      refreshShooters();
    } catch (err) {
      const msg =
        err instanceof ApiError
          ? err.message
          : err instanceof Error
            ? err.message
            : "Delete failed";
      triggerErrorBanner(msg);
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <div className="space-y-6">
      <section
        className="hud-glass rounded-xl p-4 sm:p-5"
        aria-labelledby="identity-verification-heading"
      >
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex items-start gap-3 min-w-0">
            <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[var(--hud-accent-bg)] hud-accent">
              <ScanFace className="h-4.5 w-4.5" aria-hidden="true" />
            </span>
            <div>
              <h2
                id="identity-verification-heading"
                className="admin-text-lg font-semibold hud-text"
              >
                {isAr
                  ? "التحقق من هوية الرامي"
                  : "Shooter identity verification"}
              </h2>
              <p className="admin-text-xs hud-text-muted mt-1 max-w-2xl leading-relaxed">
                {isAr
                  ? "عند التفعيل، تتطلب كل جلسة جديدة تسجيل الوجه والتحقق منه على جهاز الرامي. الجلسات الحالية لا تتغير."
                  : "When enabled, every new session requires face registration and verification on the shooter device. Existing sessions are unchanged."}
              </p>
            </div>
          </div>

          {faceRecognitionEnabled === null ? (
            <span className="flex h-11 shrink-0 items-center gap-2 self-end hud-text-muted sm:self-auto">
              <LoaderCircle
                className="h-4 w-4 animate-spin"
                aria-label={isAr ? "جار التحميل" : "Loading preference"}
              />
              <span className="admin-text-xs font-semibold">
                {isAr ? "جار التحميل" : "Loading"}
              </span>
            </span>
          ) : (
            <div className="flex shrink-0 items-center gap-2 self-end sm:self-auto">
              <span
                className={`admin-text-xs font-semibold ${
                  faceRecognitionEnabled ? "hud-accent" : "hud-text-muted"
                }`}
                aria-live="polite"
              >
                {faceRecognitionEnabled
                  ? isAr
                    ? "مطلوب"
                    : "Required"
                  : isAr
                    ? "متوقف"
                    : "Off"}
              </span>
              <button
                type="button"
                role="switch"
                aria-checked={faceRecognitionEnabled}
                aria-label={
                  isAr
                    ? "التحقق من هوية الرامي"
                    : "Shooter identity verification"
                }
                data-enabled={faceRecognitionEnabled ? "true" : "false"}
                onClick={() => void toggleFaceRecognition()}
                disabled={savingFacePreference}
                className="identity-switch"
              >
                <span className="identity-switch__track" aria-hidden="true">
                  <span className="identity-switch__thumb" />
                </span>
              </button>
            </div>
          )}
        </div>
      </section>

      {/* ── Shooters Roster Section ───────────────────────────── */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <div>
            <h2 className="admin-text-lg font-semibold hud-text">
              {isAr ? "قائمة الرُماة" : "Shooter Roster"}
            </h2>
            <p className="admin-text-2xs hud-text-muted font-mono mt-0.5">
              {isAr
                ? `${availableShooters.length} رامي مسجل`
                : `${availableShooters.length} registered shooter(s)`}
            </p>
          </div>
          <button
            type="button"
            onClick={() => setShowAddForm(!showAddForm)}
            className="
 inline-flex items-center justify-center gap-1.5
 px-3 py-1.5
 rounded-lg
 border-2
 border-[var(--hud-primary-border)]
 admin-text-2xs
 font-mono
 font-bold
 hud-btn-primary
 cursor-pointer
 transition-all
 duration-150
 hover:bg-[var(--hud-primary-bg)]
 hover:border-[var(--hud-primary-border)]
 hover:brightness-125
 "
          >
            <UserPlus className="w-3 h-3 shrink-0" />
            {isAr ? "إضافة رامي" : "Add Shooter"}
          </button>
        </div>

        {showAddForm && (
          <form
            onSubmit={handleAddShooter}
            className="mb-3 p-4 rounded-lg border border-hud bg-hud-elevated space-y-3"
          >
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block admin-text-2xs font-mono hud-text-muted mb-1">
                  {isAr ? "اسم المستخدم" : "Username"} *
                </label>
                <input
                  type="text"
                  value={newUsername}
                  onChange={(e) => setNewUsername(e.target.value)}
                  className="hud-form-input w-full rounded px-2.5 py-1.5 admin-text-base font-mono"
                  placeholder={isAr ? "الاسم" : "e.g. shooter3"}
                  required
                />
              </div>
              {/* <div>
                <label className="block admin-text-2xs font-mono hud-text-muted mb-1">
                  {isAr ? "كلمة المرور" : "Password"}
                </label>
                <input
 type="password"
 value={newPassword}
 onChange={(e) => setNewPassword(e.target.value)}
 className="hud-form-input w-full rounded px-2.5 py-1.5 admin-text-base font-mono"
 placeholder={isAr ? "اختياري" : "Optional"}
                />
              </div> */}
              <div>
                <label className="block admin-text-2xs font-mono hud-text-muted mb-1">
                  {isAr ? "الرتبة" : "Rank"}
                </label>
                <input
                  type="text"
                  value={newRank}
                  onChange={(e) => setNewRank(e.target.value)}
                  className="hud-form-input w-full rounded px-2.5 py-1.5 admin-text-base font-mono"
                  placeholder={isAr ? "اختياري" : "Optional"}
                />
              </div>
              <div>
                <label className="block admin-text-2xs font-mono hud-text-muted mb-1">
                  {isAr ? "رقم الشارة" : "Badge #"}
                </label>
                <input
                  type="text"
                  value={newBadge}
                  onChange={(e) => setNewBadge(e.target.value)}
                  className="hud-form-input w-full rounded px-2.5 py-1.5 admin-text-base font-mono"
                  placeholder={isAr ? "اختياري" : "Optional"}
                />
              </div>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="submit"
                disabled={registering || !newUsername.trim()}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg admin-text-2xs font-mono font-bold hud-btn-primary cursor-pointer transition-colors disabled:opacity-50"
              >
                {registering
                  ? isAr
                    ? "جاري التسجيل..."
                    : "Registering..."
                  : isAr
                    ? "تسجيل"
                    : "Register"}
              </button>
              <button
                type="button"
                onClick={() => {
                  setShowAddForm(false);
                  setNewUsername("");
                  setNewPassword("");
                  setNewRank("");
                  setNewBadge("");
                }}
                className="px-3 py-1.5 rounded-lg admin-text-2xs font-mono font-bold hud-btn-secondary cursor-pointer transition-colors"
              >
                {isAr ? "إلغاء" : "Cancel"}
              </button>
            </div>
          </form>
        )}

        {availableShooters.length === 0 ? (
          <p className="admin-text-xs hud-text-muted font-mono p-4 rounded-lg border border-hud border-dashed text-center">
            {isAr
              ? "قائمة الرماة خاصة بك وتبدأ فارغة. أضف راميًا جديدًا أعلاه."
              : "Your roster is yours alone and starts empty. Add a shooter above."}
          </p>
        ) : (
          <div className="space-y-1.5">
            {availableShooters.map((s) => (
              <div
                key={s.id}
                className="bg-hud-elevated rounded-lg border border-hud"
              >
                {editingId === s.id ? (
                  <div className="p-3 space-y-2">
                    <div className="grid grid-cols-3 gap-2">
                      <div>
                        <label className="block admin-text-2xs font-mono hud-text-muted mb-1">
                          {isAr ? "الاسم" : "Name"}
                        </label>
                        <input
                          type="text"
                          value={editName}
                          onChange={(e) => setEditName(e.target.value)}
                          className="hud-form-input w-full rounded px-2.5 py-1.5 admin-text-base font-mono"
                        />
                      </div>
                      <div>
                        <label className="block admin-text-2xs font-mono hud-text-muted mb-1">
                          {isAr ? "الرتبة" : "Rank"}
                        </label>
                        <input
                          type="text"
                          value={editRank}
                          onChange={(e) => setEditRank(e.target.value)}
                          className="hud-form-input w-full rounded px-2.5 py-1.5 admin-text-base font-mono"
                          placeholder={isAr ? "اختياري" : "Optional"}
                        />
                      </div>
                      <div>
                        <label className="block admin-text-2xs font-mono hud-text-muted mb-1">
                          {isAr ? "رقم الشارة" : "Badge #"}
                        </label>
                        <input
                          type="text"
                          value={editBadge}
                          onChange={(e) => setEditBadge(e.target.value)}
                          className="hud-form-input w-full rounded px-2.5 py-1.5 admin-text-base font-mono"
                          placeholder={isAr ? "اختياري" : "Optional"}
                        />
                      </div>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <button
                        type="button"
                        onClick={() => void handleSaveEdit(s.id)}
                        disabled={saving || !editName.trim()}
                        className="inline-flex items-center gap-1 px-2.5 py-1 rounded admin-text-2xs font-mono font-bold hud-btn-primary cursor-pointer transition-colors disabled:opacity-50"
                      >
                        <Check className="w-3 h-3" />
                        {saving
                          ? isAr
                            ? "جاري الحفظ..."
                            : "Saving..."
                          : isAr
                            ? "حفظ"
                            : "Save"}
                      </button>
                      <button
                        type="button"
                        onClick={cancelEdit}
                        disabled={saving}
                        className="inline-flex items-center gap-1 px-2.5 py-1 rounded admin-text-2xs font-mono font-bold hud-btn-secondary cursor-pointer transition-colors disabled:opacity-50"
                      >
                        <X className="w-3 h-3" />
                        {isAr ? "إلغاء" : "Cancel"}
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="flex items-center justify-between px-4 py-2.5">
                    <div className="flex items-center gap-2.5">
                      <span className="w-7 h-7 rounded-full bg-[var(--hud-accent-bg-subtle)] hud-accent flex items-center justify-center admin-text-2xs font-mono font-bold shrink-0">
                        {s.name.slice(0, 2).toUpperCase()}
                      </span>
                      <div>
                        <p className="admin-text-base font-mono font-bold hud-text">
                          {s.name}
                        </p>
                        <p className="admin-text-2xs font-mono hud-text-muted">
                          {[s.rank, s.badgeNumber ? `#${s.badgeNumber}` : ""]
                            .filter(Boolean)
                            .join(" · ") ||
                            (isAr ? "بدون تفاصيل" : "No details")}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        onClick={() => startEdit(s)}
                        className="p-1.5 rounded hover:bg-[var(--hud-accent-bg-subtle)] cursor-pointer transition-colors"
                        title={isAr ? "تعديل" : "Edit"}
                      >
                        <Pencil className="w-3.5 h-3.5 hud-text-muted hover:hud-accent" />
                      </button>
                      <button
                        type="button"
                        onClick={() => void handleDeleteShooter(s.id, s.name)}
                        disabled={deletingId === s.id}
                        className="p-1.5 rounded hover:bg-[var(--hud-danger-bg)] cursor-pointer transition-colors disabled:opacity-50"
                        title={isAr ? "حذف" : "Delete"}
                      >
                        <Trash2
                          className={`w-3.5 h-3.5 ${deletingId === s.id ? "hud-danger animate-pulse" : "text-hud-danger/60 hover:hud-danger"}`}
                        />
                      </button>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ── Lane assignment ───────────────────────────────────────────────────
          Who is standing where. Kept alongside the roster because the two are
 the same job in practice — an admin adding a shooter is usually about
 to put them on a lane. */}
      <div className="pt-5 border-t border-hud">
        <LaneAssignmentPanel
          isAr={isAr}
          triggerSuccessBanner={triggerSuccessBanner}
          triggerErrorBanner={triggerErrorBanner}
        />
      </div>
    </div>
  );
}
