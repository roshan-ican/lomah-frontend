import type { ReactNode } from "react";
import { RefreshCw } from "lucide-react";

interface Props {
  eyebrow: string;
  title: string;
  subtitle?: string;
  isAr: boolean;
  loading?: boolean;
  onRefresh?: () => void;
  actions?: ReactNode;
}

export function PageHeader({
  eyebrow,
  title,
  subtitle,
  isAr,
  loading,
  onRefresh,
  actions,
}: Props) {
  return (
    <header className="flex items-end justify-between gap-4 flex-wrap px-1">
      <div>
        <p className="admin-text-2xs font-semibold uppercase tracking-[0.16em] hud-accent">
          {eyebrow}
        </p>
        <h1 className="text-[clamp(1.6rem,3vw,2.25rem)] leading-[1.08] tracking-[-0.025em] font-bold hud-text mt-1.5">
          {title}
        </h1>
        {subtitle && (
          <p className="admin-text-sm leading-relaxed hud-text-muted mt-2 max-w-2xl">
            {subtitle}
          </p>
        )}
      </div>
      <div className="flex items-center gap-2">
        {actions}
        {onRefresh && (
          <button
            type="button"
            onClick={onRefresh}
            disabled={loading}
            className="hud-glass inline-flex items-center gap-2 px-3.5 py-2.5 rounded-xl admin-text-xs font-semibold hud-text-secondary hover:hud-text disabled:opacity-50 transition-colors active:scale-[0.97]"
          >
            <RefreshCw
              className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`}
            />
            {isAr ? "تحديث" : "Refresh"}
          </button>
        )}
      </div>
    </header>
  );
}

export function EmptyState({
  icon,
  title,
  hint,
}: {
  icon: ReactNode;
  title: string;
  hint?: string;
}) {
  return (
    <div className="min-h-56 grid place-items-center text-center rounded-3xl border border-dashed border-hud hud-glass p-8">
      <div>
        <div className="w-9 h-9 mx-auto hud-text-subtle mb-3 grid place-items-center">
          {icon}
        </div>
        <p className="font-semibold hud-text">{title}</p>
        {hint && <p className="admin-text-xs hud-text-muted mt-1">{hint}</p>}
      </div>
    </div>
  );
}
