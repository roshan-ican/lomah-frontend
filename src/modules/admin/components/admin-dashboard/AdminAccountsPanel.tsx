import { useEffect, useState } from "react";
import { RefreshCw, UserPlus, User as UserIcon } from "lucide-react";
import { api, ApiError } from "../../../../utils/api";
import { PasswordInput } from "../../../../components/common/PasswordInput";
import type { AdminSummary, CreateAdminRequest } from "../../../../types";

interface Props {
  isAr: boolean;
  triggerSuccessBanner: (msg: string) => void;
  /** Failures. Rendered red with a warning icon — routing them through
   *  triggerSuccessBanner produced a green checkmark on the word "Error". */
  triggerErrorBanner: (msg: string) => void;
  addAdminLog: (msg: string) => void;
}

const EMPTY_FORM: CreateAdminRequest = { username: "", password: "" };

/**
 * Who can log into this range, and adding another admin. Reachable only by the
 * SUPER_ADMIN, and enforced server-side in UsersController rather than by this
 * component being hard to get to.
 *
 * Adds ADMINs only. The range has one SUPER_ADMIN, seeded at first run.
 */
export function AdminAccountsPanel({
  isAr,
  triggerSuccessBanner,
  triggerErrorBanner,
  addAdminLog,
}: Props) {
  const [admins, setAdmins] = useState<AdminSummary[]>([]);
  const [loading, setLoading] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState<CreateAdminRequest>(EMPTY_FORM);
  const [submitting, setSubmitting] = useState(false);
  /** Shown next to the form, not in the top banner — a toast for "password too
   *  short" is easy to miss while looking at the input that caused it. */
  const [formError, setFormError] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    try {
      const rows = await api.get<AdminSummary[]>("/users");
      // ADMINs only. The endpoint answers "who can log in", which includes the
      // SUPER_ADMIN — but this screen manages the accounts a super admin
      // created, and their own is not one of them.
      setAdmins(
        Array.isArray(rows) ? rows.filter((a) => a.role === "ADMIN") : [],
      );
    } catch (err) {
      triggerErrorBanner(
        isAr
          ? "تعذّر تحميل قائمة المشرفين"
          : `Could not load admins${err instanceof ApiError ? `: ${err.message}` : ""}`,
      );
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);

    const username = form.username.trim();
    if (username.length < 3) {
      setFormError(
        isAr
          ? "اسم المستخدم قصير جدًا (٣ أحرف على الأقل)"
          : "Username must be at least 3 characters",
      );
      return;
    }
    if (form.password.length < 8) {
      setFormError(
        isAr
          ? "كلمة المرور قصيرة جدًا (٨ أحرف على الأقل)"
          : "Password must be at least 8 characters",
      );
      return;
    }

    setSubmitting(true);
    try {
      const created = await api.post<AdminSummary>("/users", {
        ...form,
        username,
      });
      // The list is oldest-first, so the new row belongs at the end either
      // way — appending saves a round trip.
      setAdmins((prev) => [...prev, created]);
      setForm(EMPTY_FORM);
      setShowForm(false);
      triggerSuccessBanner(
        isAr
          ? `تم إنشاء الحساب ${created.username} ✓`
          : `Account "${created.username}" created ✓`,
      );
      addAdminLog(`Created admin "${created.username}"`);
    } catch (err) {
      const msg =
        err instanceof Error ? err.message : "Failed to create account";
      // 409 means the name is taken — user-fixable, so it belongs beside the
      // field rather than in a banner about a system failure.
      if (err instanceof ApiError && err.statusCode === 409) {
        setFormError(isAr ? "اسم المستخدم مستخدم بالفعل" : msg);
      } else {
        triggerErrorBanner(msg);
      }
    } finally {
      setSubmitting(false);
    }
  };

  /** Colours only — PasswordInput supplies its own width and padding. */
  const inputSkin = "hud-form-input rounded admin-text-base font-mono disabled:opacity-50";
  const inputCls = `${inputSkin} px-2.5 py-1.5 w-full`;

  return (
    <div>
      <div className="flex items-center justify-between mb-3 gap-2">
        <div>
          <h2 className="admin-text-lg font-semibold hud-text">
            {isAr ? "حسابات المشرفين" : "Admin Accounts"}
          </h2>
          <p className="admin-text-2xs hud-text-muted font-mono mt-0.5">
            {isAr
              ? "من يستطيع تسجيل الدخول إلى هذا المدى"
              : "Who can sign in to this range"}
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={() => void load()}
            disabled={loading}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg admin-text-2xs font-mono font-bold hud-btn-secondary cursor-pointer transition-colors disabled:opacity-50"
          >
            <RefreshCw
              className={`w-3 h-3 shrink-0 ${loading ? "animate-spin" : ""}`}
            />
            {isAr ? "تحديث" : "Refresh"}
          </button>
          <button
            type="button"
            onClick={() => {
              setShowForm((v) => !v);
              setFormError(null);
            }}
            className="inline-flex items-center gap-1.5 px-3 py-1.5  rounded-lg admin-text-2xs font-mono font-bold hud-btn-primary cursor-pointer transition-colors"
          >
            <UserPlus className="w-3 h-3 shrink-0" />
            {isAr ? "إضافة مشرف" : "Add Admin"}
          </button>
        </div>
      </div>

      {showForm && (
        <form
          onSubmit={submit}
          className="mb-4 p-3 bg-hud-elevated rounded-lg border border-hud space-y-3"
        >
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <label className="block">
              <span className="admin-text-2xs font-mono hud-text-subtle uppercase tracking-wider">
                {isAr ? "اسم المستخدم" : "Username"}
              </span>
              <input
                className={inputCls}
                value={form.username}
                onChange={(e) =>
                  setForm((f) => ({ ...f, username: e.target.value }))
                }
                disabled={submitting}
                autoComplete="off"
                spellCheck={false}
              />
            </label>
            <label className="block">
              <span className="admin-text-2xs font-mono hud-text-subtle uppercase tracking-wider">
                {isAr ? "كلمة المرور" : "Password"}
              </span>
              {/* Sizing comes from PasswordInput — it reserves room on the
                  right for the eye, so `inputCls`'s own padding is left off. */}
              <PasswordInput
                value={form.password}
                onChange={(password) => setForm((f) => ({ ...f, password }))}
                disabled={submitting}
                autoComplete="new-password"
                showLockIcon={false}
                inputClassName={inputSkin}
                placeholder=""
              />
            </label>
          </div>

          {formError && (
            <p className="admin-text-2xs font-mono text-red-500">{formError}</p>
          )}

          <p className="admin-text-2xs font-mono hud-text-subtle">
            {isAr
              ? "لا يمكن استرجاع كلمة المرور لاحقًا — سلّمها للمشرف الآن."
              : "The password cannot be read back later — hand it to the admin now."}
          </p>

          <div className="flex items-center gap-2">
            <button
              type="submit"
              disabled={submitting}
              className="px-3 py-1.5 rounded-lg admin-text-2xs font-mono font-bold hud-btn-primary cursor-pointer disabled:opacity-50"
            >
              {submitting
                ? isAr
                  ? "جارٍ الإنشاء…"
                  : "Creating…"
                : isAr
                  ? "إنشاء الحساب"
                  : "Create Account"}
            </button>
            <button
              type="button"
              onClick={() => {
                setShowForm(false);
                setForm(EMPTY_FORM);
                setFormError(null);
              }}
              disabled={submitting}
              className="px-3 py-1.5 rounded-lg admin-text-2xs font-mono hud-btn-secondary cursor-pointer disabled:opacity-50"
            >
              {isAr ? "إلغاء" : "Cancel"}
            </button>
          </div>
        </form>
      )}

      {admins.length === 0 ? (
        <div className="px-3 py-4 rounded-lg border border-dashed border-hud text-center">
          <p className="admin-text-2xs font-mono hud-text-subtle">
            {loading
              ? isAr
                ? "جارٍ التحميل…"
                : "Loading…"
              : isAr
                ? "لم يتم إنشاء أي مشرف بعد. استخدم «إضافة مشرف» أعلاه."
                : "No admins created yet. Use Add Admin above."}
          </p>
        </div>
      ) : (
        <div className="space-y-1.5">
          {admins.map((admin) => (
            <div
              key={admin.id}
              className="flex items-center justify-between gap-2 px-3 py-2 bg-hud-elevated rounded-lg border border-hud"
            >
              <div className="flex items-center gap-2.5 min-w-0">
                <span className="w-6 h-6 rounded-full flex items-center justify-center shrink-0 bg-[var(--hud-accent-bg-subtle)] hud-accent">
                  <UserIcon className="w-3 h-3" />
                </span>
                <div className="min-w-0">
                  <p className="admin-text-base font-mono hud-text truncate">
                    {admin.username}
                  </p>
                  <p className="admin-text-2xs font-mono hud-text-subtle">
                    {isAr ? "أُنشئ" : "Created"}{" "}
                    {new Date(admin.createdAt).toLocaleDateString()}
                  </p>
                </div>
              </div>
              <span className="px-1.5 py-0.5 rounded admin-text-2xs font-mono shrink-0 bg-[var(--hud-accent-bg-subtle)] hud-accent">
                {isAr ? "مشرف" : "ADMIN"}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
