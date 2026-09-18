/// <reference types="react" />
import React, { useState } from "react";
import { Crosshair, Wifi, BookOpen, Users, ScanLine } from "lucide-react";
import { translations, TranslationSet } from "../../../translations";
import { AdminHeader } from "./admin-dashboard/AdminHeader";
import { LaneHardwarePanel } from "./admin-dashboard/LaneHardwarePanel";
import { LaneAssignmentPanel } from "./admin-dashboard/LaneAssignmentPanel";
import { AdminAccountsPanel } from "./admin-dashboard/AdminAccountsPanel";
import { AdminHelp } from "./AdminHelp";
import { ActivityLog } from "./ActivityLog";
import { TargetCalibrationView } from "./admin-dashboard/TargetCalibrationView";
import type { LanguageCode } from "./admin-dashboard/types";

type SuperAdminTab =
  "LANE_HARDWARE" | "CALIBRATION" | "DEVICES" | "HELP" | "USERS";

interface SuperAdminDashboardProps {
  isDarkMode: boolean;
  setIsDarkMode: (val: boolean) => void;
  language: LanguageCode;
  setLanguage: (lang: LanguageCode) => void;
  triggerSuccessBanner: (msg: string) => void;
  /** Failures. Rendered red with a warning icon — routing them through
   *  triggerSuccessBanner produced a green checkmark on the word "Error". */
  triggerErrorBanner: (msg: string) => void;
  addAdminLog: (msg: string) => void;
  handleLogout: () => void;
  adminLogs: string[];
}

/**
 * The commissioning console. Deliberately NOT the admin dashboard.
 *
 * SUPER_ADMIN defines what the range physically is — lanes, the targets
 * mounted on them, their addresses and calibration — and then leaves. Running
 * relays is ADMIN's job on the operations dashboard.
 *
 * That separation is enforced by this component existing at all: there is no
 * lane grid, no start/pause/stop, no shooter assignment and no session state
 * anywhere in this tree, so a SUPER_ADMIN cannot interfere with a live relay
 * even by accident. Sharing one dashboard with a role flag would leave those
 * controls one conditional away from being reachable.
 */
export const SuperAdminDashboard: React.FC<SuperAdminDashboardProps> = ({
  isDarkMode,
  setIsDarkMode,
  language,
  setLanguage,
  triggerSuccessBanner,
  triggerErrorBanner,
  addAdminLog,
  handleLogout,
  adminLogs,
}) => {
  const isAr = language === "ar";
  const t: TranslationSet = translations[language];
  const [activeTab, setActiveTab] = useState<SuperAdminTab>("LANE_HARDWARE");
  const [navOpen, setNavOpen] = useState(false);

  const navItems: {
    tab: SuperAdminTab;
    icon: React.ReactNode;
    label: string;
  }[] = [
    {
      tab: "LANE_HARDWARE",
      icon: <Crosshair className="w-4 h-4 shrink-0" />,
      label: isAr ? "الحارات والأهداف" : "Lanes & Targets",
    },
    {
      tab: "DEVICES",
      icon: <Wifi className="w-4 h-4 shrink-0" />,
      label: isAr ? "أجهزة الرماة" : "Devices",
    },
    {
      tab: "CALIBRATION",
      icon: <ScanLine className="w-4 h-4 shrink-0" />,
      label: isAr ? "معايرة الأهداف" : "Target Calibration",
    },
    {
      tab: "USERS",
      icon: <Users className="w-4 h-4 shrink-0" />,
      label: isAr ? "المشرفون" : "Admins",
    },
    {
      tab: "HELP",
      icon: <BookOpen className="w-4 h-4 shrink-0" />,
      label: isAr ? "الدليل" : "Manual",
    },
  ];

  const selectTab = (tab: SuperAdminTab) => {
    setActiveTab(tab);
    setNavOpen(false);
  };

  return (
    <div
      className={`h-dvh-screen overflow-hidden flex flex-col transition-colors duration-200 ${
        isDarkMode
          ? "bg-[#0f1115] text-[#e2e2e6]"
          : "bg-[#F4F6F9] text-gray-900"
      }`}
    >
      <AdminHeader
        t={t}
        isAr={isAr}
        isDarkMode={isDarkMode}
        setIsDarkMode={setIsDarkMode}
        language={language}
        setLanguage={setLanguage}
        navOpen={navOpen}
        setNavOpen={setNavOpen}
        // Always zero: this console has no visibility into live fire, by
        // design. The header's "live" indicator is an operations concern.
        liveFiringCount={0}
        handleLogout={handleLogout}
        isSuperAdmin
      />

      <div className="flex-1 flex flex-col md:flex-row relative min-h-0 admin-app-body-offset">
        {navOpen && (
          <button
            type="button"
            aria-label={isAr ? "إغلاق القائمة" : "Close navigation overlay"}
            className="fixed inset-0 admin-app-top-offset bg-black/40 z-20 md:hidden cursor-default"
            onClick={() => setNavOpen(false)}
          />
        )}

        <aside
          className={`shrink-0 flex flex-col hud-sidebar border-b md:border-b-0 md:border-e border-hud z-30 transition-all duration-200 ease-in-out
            absolute md:relative inset-x-0 top-0 md:top-auto
            ${navOpen ? "flex" : "hidden md:flex"}
            ${
              navOpen
                ? "md:admin-sidebar-w md:opacity-100 md:overflow-visible"
                : "md:w-0 md:p-0 md:border-0 md:opacity-0 md:overflow-hidden"
            }`}
        >
          <div className="admin-sidebar-min flex flex-col flex-1">
            <div className="px-4 pt-4 pb-2">
              <p className="admin-text-2xs font-semibold uppercase tracking-[0.16em] hud-accent">
                {isAr ? "المشرف الأعلى" : "Super Admin"}
              </p>
            </div>

            <nav className="flex-1 px-2 py-2 space-y-1">
              {navItems.map((item) => (
                <button
                  key={item.tab}
                  type="button"
                  onClick={() => selectTab(item.tab)}
                  className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl admin-text-sm font-semibold cursor-pointer transition-colors active:scale-[0.98] border ${
                    activeTab === item.tab
                      ? "bg-[var(--hud-accent-bg-subtle)] border-[var(--hud-accent-border)] hud-text"
                      : "border-transparent hud-text-muted hover:hud-text"
                  }`}
                >
                  {item.icon}
                  <span className="truncate">{item.label}</span>
                </button>
              ))}
            </nav>

            <div className="px-4 py-3 border-t border-hud">
              <p className="admin-text-2xs hud-text-subtle leading-relaxed">
                {isAr ? "الجلسات تُدار من حساب المشرف." : "Sessions run from the admin account."}
              </p>
            </div>
          </div>
        </aside>

        <main className="flex-1 min-h-0 overflow-hidden w-full flex flex-col p-4 md:p-6">
          {/* Full width, not a centred column: the hardware table is a wide
              grid (face, label, distance, profile, address, position) and a
              6xl cap squeezed every cell for the sake of a margin. */}
          <div className="w-full flex-1 min-h-0 overflow-y-auto">
            {activeTab === "LANE_HARDWARE" && (
              <LaneHardwarePanel
                isAr={isAr}
                triggerSuccessBanner={triggerSuccessBanner}
                triggerErrorBanner={triggerErrorBanner}
                addAdminLog={addAdminLog}
                mode="commissioning"
              />
            )}
            {/* The same panel the admin has. Assignment is operations, so the
                admin owns it day to day — but a super admin commissioning a
                range needs to put a tablet on a lane to test it, and the
                endpoint allows both roles already. */}
            {activeTab === "DEVICES" && (
              <LaneAssignmentPanel
                isAr={isAr}
                triggerSuccessBanner={triggerSuccessBanner}
                triggerErrorBanner={triggerErrorBanner}
              />
            )}
            {activeTab === "CALIBRATION" && (
              <TargetCalibrationView
                isAr={isAr}
                triggerSuccessBanner={triggerSuccessBanner}
                triggerErrorBanner={triggerErrorBanner}
                addAdminLog={addAdminLog}
              />
            )}
            {activeTab === "HELP" && (
              // SUPER_ADMIN gets the hardware commissioning/testing guide,
              // not the range-officer session-ops one.
              <AdminHelp language={language} t={t} variant="superAdmin" />
            )}
            {activeTab === "USERS" && (
              <AdminAccountsPanel
                isAr={isAr}
                triggerSuccessBanner={triggerSuccessBanner}
                triggerErrorBanner={triggerErrorBanner}
                addAdminLog={addAdminLog}
              />
            )}
          </div>

          <ActivityLog
            logs={adminLogs}
            isAr={isAr}
            storageKey="lomah:activity-log-height:super-admin"
          />
        </main>
      </div>
    </div>
  );
};
