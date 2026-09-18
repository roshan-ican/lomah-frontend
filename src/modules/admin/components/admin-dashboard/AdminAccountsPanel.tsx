import { useEffect, useState } from "react";
import { Loader2, UserPlus, Users } from "lucide-react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { PageHeader, EmptyState } from "./PageHeader";
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

  const reduceMotion = useReducedMotion();
  const spring = reduceMotion
    ? { duration: 0.15 }
    : { type: "spring" as const, bounce: 0, duration: 0.35 };

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

  const inputSkin =
    "hud-form-input rounded-xl admin-text-sm disabled:opacity-50";
  const inputCls = `${inputSkin} px-3 py-2.5 w-full`;
  const labelCls =
    "block admin-text-2xs font-semibold uppercase tracking-[0.14em] hud-text-muted mb-1.5";

  const closeForm = () => {
    setShowForm(false);
    setForm(EMPTY_FORM);
    setFormError(null);
  };

  return (
    <section className="space-y-5 pb-8">
      <PageHeader
        eyebrow={isAr ? "الوصول" : "Access"}
        title={isAr ? "المشرفون" : "Admins"}
        subtitle={isAr ? "من يستطيع تسجيل الدخول." : "Who can sign in to this range."}
        isAr={isAr}
        loading={loading}
        onRefresh={() => void load()}
        actions={
          !showForm && (
            <button
              type="button"
              onClick={() => {
                setShowForm(true);
                setFormError(null);
              }}
              className="inline-flex items-center gap-2 px-3.5 py-2.5 rounded-xl admin-text-xs font-semibold hud-btn-primary transition-transform active:scale-[0.97]"
            >
              <UserPlus className="w-3.5 h-3.5" />
              {isAr ? "إضافة" : "Add admin"}
            </button>
          )
        }
      />

      <AnimatePresence initial={false}>
        {showForm && (
          <motion.form
            onSubmit={submit}
            initial={reduceMotion ? { opacity: 0 } : { opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={reduceMotion ? { opacity: 0 } : { opacity: 0, y: -8 }}
            transition={spring}
            className="hud-glass rounded-3xl p-4 md:p-5 space-y-4"
          >
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <label className="block">
                <span className={labelCls}>{isAr ? "اسم المستخدم" : "Username"}</span>
                <input
                  className={inputCls}
                  value={form.username}
                  onChange={(e) => setForm((f) => ({ ...f, username: e.target.value }))}
                  disabled={submitting}
                  autoComplete="off"
                  spellCheck={false}
                  autoFocus
                />
              </label>
              <label className="block">
                <span className={labelCls}>{isAr ? "كلمة المرور" : "Password"}</span>
                <PasswordInput
                  value={form.password}
                  onChange={(password) => setForm((f) => ({ ...f, password }))}
                  disabled={submitting}
                  autoComplete="new-password"
                  showLockIcon={false}
                  inputClassName={inputSkin}
                  placeholder={isAr ? "٨ أحرف على الأقل" : "8+ characters"}
                />
              </label>
            </div>

            {formError && (
              <p className="admin-text-xs font-medium text-red-500">{formError}</p>
            )}

            <div className="flex items-center justify-between gap-3 flex-wrap">
              <p className="admin-text-2xs hud-text-subtle">
                {isAr ? "لا يمكن عرض كلمة المرور لاحقًا." : "Password can't be viewed later."}
              </p>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={closeForm}
                  disabled={submitting}
                  className="px-3.5 py-2 rounded-xl admin-text-xs font-semibold hud-btn-secondary disabled:opacity-50 active:scale-[0.97]"
                >
                  {isAr ? "إلغاء" : "Cancel"}
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="inline-flex items-center gap-2 px-3.5 py-2 rounded-xl admin-text-xs font-semibold hud-btn-primary disabled:opacity-50 active:scale-[0.97]"
                >
                  {submitting && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                  {isAr ? "إنشاء" : "Create"}
                </button>
              </div>
            </div>
          </motion.form>
        )}
      </AnimatePresence>

      {admins.length === 0 ? (
        loading ? (
          <div className="min-h-56 grid place-items-center rounded-3xl border border-hud hud-glass">
            <Loader2 className="w-6 h-6 animate-spin hud-accent" />
          </div>
        ) : (
          <EmptyState
            icon={<Users className="w-9 h-9" />}
            title={isAr ? "لا يوجد مشرفون" : "No admins yet"}
            hint={isAr ? "أضف أول مشرف." : "Add the first one above."}
          />
        )
      ) : (
        <div className="hud-glass rounded-3xl p-2.5">
          {admins.map((admin) => (
            <div
              key={admin.id}
              className="flex items-center gap-3 rounded-2xl px-3 py-3"
            >
              <span className="grid place-items-center w-9 h-9 rounded-xl shrink-0 bg-[var(--hud-accent-bg-subtle)] hud-accent admin-text-sm font-bold uppercase">
                {admin.username.slice(0, 1)}
              </span>
              <div className="min-w-0 flex-1">
                <p className="admin-text-sm font-semibold hud-text truncate">
                  {admin.username}
                </p>
                <p className="admin-text-2xs hud-text-muted mt-0.5">
                  {new Date(admin.createdAt).toLocaleDateString()}
                </p>
              </div>
              <span className="rounded-full bg-hud-elevated px-3 py-1 admin-text-2xs font-semibold hud-text-muted">
                {isAr ? "مشرف" : "Admin"}
              </span>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
