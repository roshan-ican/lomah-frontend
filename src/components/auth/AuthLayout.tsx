// src/components/auth/AuthLayout.tsx
import { Target, ShieldAlert } from "lucide-react";
import { TranslationSet } from "../../translations";
import { PortalSelector } from "./PortalSelector";
import { AdminLoginForm } from "./AdminLoginForm";
import { ShooterLoginForm } from "./ShooterLoginForm";

type AuthStage = "PORTAL" | "LOGIN_ADMIN" | "LOGIN_SHOOTER";

interface Props {
  authStage: AuthStage;
  isDarkMode: boolean;
  setIsDarkMode: (v: boolean) => void;
  language: "en" | "ar";
  setLanguage: (v: "en" | "ar") => void;
  isAr: boolean;
  t: TranslationSet;
  authError: string | null;
  onAdminSelect: () => void;
  onShooterSelect: () => void;
  onBackToPortal: () => void;
  onAdminLogin: (username: string, password: string) => Promise<void>;
  onShooterLogin: (username: string) => Promise<void>;
}

export function AuthLayout({
  authStage,
  isDarkMode,
  setIsDarkMode,
  language,
  setLanguage,
  isAr,
  t,
  authError,
  onAdminSelect,
  onShooterSelect,
  onBackToPortal,
  onAdminLogin,
  onShooterLogin,
}: Props) {
  return (
    <div className="flex-grow flex flex-col items-center justify-center p-4 relative overflow-hidden">
      {/* Radar backdrop */}
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[550px] h-[550px] border border-emerald-500/[0.04] dark:border-emerald-success/[0.07] rounded-full pointer-events-none select-none z-1 flex items-center justify-center">
        <div className="w-[380px] h-[380px] border border-emerald-500/[0.03] dark:border-emerald-success/[0.05] rounded-full flex items-center justify-center">
          <div className="w-1.5 h-1.5 bg-emerald-500/20 rounded-full animate-ping"></div>
        </div>
      </div>

      <div className="w-full max-w-md z-10">
        {/* Logo */}
        <div className="text-center mb-6 select-none">
          <div className="mx-auto w-12 h-12 rounded-2xl bg-emerald-500/10 dark:bg-emerald-success/10 flex items-center justify-center border border-emerald-500/20 mb-3.5 shadow-sm">
            <Target className="w-6 h-6 text-emerald-500 animate-pulse" />
          </div>
          <h1 className="text-xl md:text-2xl font-black tracking-widest font-sans text-gray-800 dark:text-white uppercase">
            {t.brand}
          </h1>
          <p className="admin-text-sm font-mono text-gray-500 mt-1 select-none">
            {t.secureTerminal}
          </p>
        </div>

        {/* Error banner */}
        {authError && (
          <div className="mb-4 p-3 bg-rose-500/10 border border-rose-500/20 rounded-xl admin-text-sm font-mono font-bold text-rose-500 flex items-center gap-2">
            <ShieldAlert className="w-4 h-4 shrink-0" />
            <span>{authError}</span>
          </div>
        )}

        {authStage === "PORTAL" && (
          <PortalSelector
            isDarkMode={isDarkMode}
            setIsDarkMode={setIsDarkMode}
            language={language}
            setLanguage={setLanguage}
            isAr={isAr}
            t={t}
            onAdminSelect={onAdminSelect}
            onShooterSelect={onShooterSelect}
          />
        )}

        {authStage === "LOGIN_ADMIN" && (
          <AdminLoginForm
            isDarkMode={isDarkMode}
            isAr={isAr}
            t={t}
            onBack={onBackToPortal}
            onSubmit={onAdminLogin}
          />
        )}

        {authStage === "LOGIN_SHOOTER" && (
          <ShooterLoginForm
            isDarkMode={isDarkMode}
            isAr={isAr}
            t={t}
            onBack={onBackToPortal}
            onSubmit={onShooterLogin}
          />
        )}
      </div>
    </div>
  );
}
