import { useState } from "react";
import { UserPlus, Pencil, Trash2, Check, X } from "lucide-react";
import type { Shooter } from "../../../../types";
import { api, ApiError } from "../../../../utils/api";
import { LaneAssignmentPanel } from "./LaneAssignmentPanel";

interface Props {
  isAr: boolean;
  availableShooters: Shooter[];
  refreshShooters: () => void;
  triggerSuccessBanner: (msg: string) => void;
  /** Failures. Rendered red with a warning icon — routing them through
   *  triggerSuccessBanner produced a green checkmark on the word "Error". */
  triggerErrorBanner: (msg: string) => void;
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
        isAr
          ? `تم حذف الرامي "${name}" ✓`
          : `Shooter "${name}" deleted ✓`,
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
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg admin-text-2xs font-mono font-bold hud-btn-primary cursor-pointer transition-colors"
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
              ? "لا يوجد رماة مسجلون. أضف راميًا جديدًا."
              : "No shooters registered. Add a new shooter above."}
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
                            .join(" · ") || (isAr ? "بدون تفاصيل" : "No details")}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        onClick={() => startEdit(s)}
                        className="p-1.5 rounded hover:bg-hud-hover cursor-pointer transition-colors"
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
                        <Trash2 className={`w-3.5 h-3.5 ${deletingId === s.id ? "hud-danger animate-pulse" : "hud-danger/60 hover:hud-danger"}`} />
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
