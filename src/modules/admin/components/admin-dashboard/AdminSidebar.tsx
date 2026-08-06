import {
  Radio,
  BookOpen,
  Pause,
  Hand,
  Crosshair,
  Eye,
  LayoutGrid,
  FileSpreadsheet,
  Users,
} from "lucide-react";
import { useEffect, useState } from "react";
import type { TranslationSet } from "../../../../translations";
import type { AdminTab, SensorGate } from "./types";
import { api } from "../../../../utils/api";
import type { SystemInfo } from "../../../../types";

interface Props {
  navOpen: boolean;
  activeTab: AdminTab;
  selectTab: (tab: AdminTab) => void;
  isAr: boolean;
  t: TranslationSet;
  liveBoardMode: boolean;
  toggleLiveBoardMode: () => void;
  onStartAllSessions: () => void;
  onPauseAllSessions: () => void;
  sensorGate: SensorGate;
  setSensorHold: (held: boolean) => void;
}

export function AdminSidebar({
  navOpen,
  activeTab,
  selectTab,
  isAr,
  t,
  liveBoardMode,
  toggleLiveBoardMode,
  onStartAllSessions,
  onPauseAllSessions,
  sensorGate,
  setSensorHold,
}: Props) {
  // Split-brain (two admins, each with its own database) is otherwise silent
  // until a shooter roster or shot count mismatch is noticed in the field —
  // this makes the database this device is actually writing to checkable at a
  // glance instead of by guessing from symptoms.
  // `databaseUrl`, not `dbPath` — the backend reports the configured
  // DATABASE_URL rather than a resolved filesystem path.
  const [dbInfo, setDbInfo] = useState<SystemInfo | null>(null);
  useEffect(() => {
    api
      .get<SystemInfo>("/system/info")
      .then(setDbInfo)
      .catch(() => {});
  }, []);
  const navItems = [
    {
      tab: "CONTROL" as const,
      icon: <Radio className="w-4 h-4 shrink-0" />,
      label: t.liveCommandGrid,
    },
    {
      tab: "SESSIONS" as const,
      icon: <Crosshair className="w-4 h-4 shrink-0" />,
      label: isAr ? "سجل الجلسات" : "Session History",
    },
    {
      tab: "SHOOTERS" as const,
      icon: <Users className="w-4 h-4 shrink-0" />,
      // Roster AND lane assignment: moving people between lanes is range
      // operation, so it belongs to the admin, not the commissioning console.
      label: isAr ? "الرُماة والأجهزة" : "Shooters & Devices",
    },
    {
      tab: "REPORTS" as const,
      icon: <FileSpreadsheet className="w-4 h-4 shrink-0" />,
      label: isAr ? "التقارير والكشوفات" : " Analytics & Stats",
    },
    // Read-only view of the commissioned hardware. ADMIN sees the same table
    // the SUPER_ADMIN configured — same styles, same data — but every write
    // (add lane / add target / re-address / status) stays @Roles('SUPER_ADMIN')
    // server-side, so this tab renders exactly what was set in lane hardware
    // management and nothing more. See LaneHardwarePanel `readOnly`.
    {
      tab: "LANE_HARDWARE" as const,
      icon: <Crosshair className="w-4 h-4 shrink-0" />,
      label: isAr ? "الحارات والأهداف" : "Lanes & Targets",
    },
    {
      tab: "HELP" as const,
      icon: <BookOpen className="w-4 h-4 shrink-0" />,
      label: isAr ? "دليل المشرف والدعم" : "Admin Guide & Manual",
    },
  ];

  return (
    <aside
      className={`shrink-0 flex flex-col gap-2 hud-sidebar border-r border-hud transition-all duration-200 ease-in-out z-30
        fixed admin-app-top-offset bottom-0 left-0 w-64 p-4
        ${navOpen ? "translate-x-0" : "-translate-x-full pointer-events-none"}
        md:static md:top-auto md:bottom-auto md:translate-x-0 md:pointer-events-auto
        ${
          navOpen
            ? "md:w-64 md:p-4 md:opacity-100 md:overflow-visible"
            : "md:w-0 md:p-0 md:border-0 md:opacity-0 md:overflow-hidden"
        }`}
    >
      <div className="hidden md:block pb-3 border-b border-hud mb-3 min-w-[14rem]">
        <span className="hud-label hud-text-muted">
          {isAr ? "لوحة الملاحة العامة" : "RANGE CONSOLE NAV"}
        </span>
      </div>

      <div className="min-w-[14rem] flex flex-col gap-2">
        {navItems.map(({ tab, icon, label }) => (
          <button
            key={tab}
            type="button"
            onClick={() => selectTab(tab)}
            className={`hud-sidebar-nav-btn flex items-center justify-start gap-2.5 p-3 rounded-lg cursor-pointer whitespace-nowrap ${
              activeTab === tab
                ? "hud-sidebar-nav-btn--active"
                : "hud-sidebar-nav-btn--idle"
            }`}
          >
            {icon}
            <span>{label}</span>
          </button>
        ))}

        {activeTab === "CONTROL" && (
          <div className="mt-3 pt-3 border-t border-hud flex flex-col gap-2">
            <span className="range-rail-label px-1 mb-0.5">
              {isAr ? "تحكم الميدان" : "RANGE OPS"}
            </span>
            <button
              type="button"
              onClick={toggleLiveBoardMode}
              className={`range-rail-btn flex items-center gap-2 p-2.5 rounded-lg cursor-pointer transition-colors ${
                liveBoardMode
                  ? "hud-accent bg-[var(--hud-accent-bg-subtle)]"
                  : "hud-text-secondary hover:hud-accent hover:bg-[var(--hud-accent-bg-subtle)]"
              }`}
            >
              {liveBoardMode ? (
                <LayoutGrid className="w-3.5 h-3.5 shrink-0" />
              ) : (
                <Eye className="w-3.5 h-3.5 shrink-0" />
              )}
              {liveBoardMode
                ? isAr
                  ? "إظهار الحالة"
                  : "Show Status"
                : isAr
                  ? "عرض مباشر"
                  : "Show Live"}
            </button>
            <button
              type="button"
              onClick={onStartAllSessions}
              className="range-rail-btn flex items-center gap-2 p-2.5 rounded-lg hud-success hover:bg-[color-mix(in_srgb,var(--hud-success)_10%,transparent)] cursor-pointer transition-colors"
            >
              <Radio className="w-3.5 h-3.5 shrink-0" />
              {isAr ? "تشغيل الكل" : "Start All Lanes"}
            </button>
            <button
              type="button"
              onClick={onPauseAllSessions}
              className="range-rail-btn flex items-center gap-2 p-2.5 rounded-lg hud-warning hover:bg-[var(--hud-warning-bg)] cursor-pointer transition-colors"
            >
              <Pause className="w-3.5 h-3.5 shrink-0" />
              {isAr ? "إيقاف الكل" : "Pause All Lanes"}
            </button>
            <button
              type="button"
              onClick={() => setSensorHold(!sensorGate.adminHeld)}
              className={`range-rail-btn flex items-center gap-2 p-2.5 rounded-lg cursor-pointer transition-colors ${
                sensorGate.adminHeld
                  ? "hud-accent hover:bg-[var(--hud-accent-bg-subtle)]"
                  : "hud-danger hover:bg-[var(--hud-danger-bg)]"
              }`}
            >
              <Hand className="w-3.5 h-3.5 shrink-0" />
              {sensorGate.adminHeld
                ? isAr
                  ? "تحرير المستشعر"
                  : "Release sensor"
                : isAr
                  ? "إيقاف المستشعر"
                  : "Hold sensor"}
            </button>
            <div
              className={`flex items-center gap-1.5 px-2.5 py-2 font-mono admin-text-sm ${
                sensorGate.accepting ? "hud-success" : "hud-text-muted"
              }`}
            >
              <span
                className={`w-1.5 h-1.5 rounded-full shrink-0 ${
                  sensorGate.accepting
                    ? "bg-[var(--hud-success)] animate-pulse"
                    : "bg-[var(--hud-text-subtle)]"
                }`}
              />
              {sensorGate.accepting
                ? isAr
                  ? "المستشعر: نشط"
                  : "Sensor: live"
                : isAr
                  ? "المستشعر: متوقف"
                  : "Sensor: hold"}
            </div>
          </div>
        )}
      </div>

      <div className="hidden md:flex flex-col-reverse flex-grow font-mono admin-text-sm leading-snug hud-text-subtle select-none pb-2 gap-1 min-w-[14rem]">
        {dbInfo && (
          <span
            className="truncate opacity-60"
            title={`${dbInfo.databaseUrl}\n${dbInfo.shooterCount} shooter(s) · ${dbInfo.sessionCount} session(s)`}
          >
            DB: {dbInfo.shooterCount} shooters · {dbInfo.sessionCount} sessions
          </span>
        )}
        <span>{t.stableLink}</span>
        <span className="flex items-center gap-1">
          <span className="w-1 h-1 rounded-full bg-[var(--hud-accent)]"></span>
          {t.sysOnline}
        </span>
      </div>
    </aside>
  );
}
