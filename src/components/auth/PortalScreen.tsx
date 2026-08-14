import { Target, Shield, User, ArrowLeft, ShieldAlert } from "lucide-react";
import { motion } from "motion/react";
import { LanguageSwitcher } from "../common/LanguageSwitcher";
import { ThemeSwitcher } from "../common/ThemeSwitcher";
import { PasswordInput } from "../common/PasswordInput";
import { TranslationSet } from "../../translations";
import { goToShooterScan } from "../../utils/shooterNavigation";

interface Props {
  authStage: "PORTAL" | "LOGIN_ADMIN" | "LOGIN_SHOOTER" | "REGISTER_SHOOTER";
  setAuthStage: (s: Props["authStage"]) => void;
  isDarkMode: boolean;
  setIsDarkMode: (v: boolean) => void;
  language: "en" | "ar";
  setLanguage: (l: "en" | "ar") => void;
  t: TranslationSet;
  adminFieldId: string;
  setAdminFieldId: (v: string) => void;
  adminFieldKey: string;
  setAdminFieldKey: (v: string) => void;
  shooterFieldId: string;
  setShooterFieldId: (v: string) => void;
  shooterFieldKey: string;
  setShooterFieldKey: (v: string) => void;
  regUnit: string;
  setRegUnit: (v: string) => void;
  regOpId: string;
  setRegOpId: (v: string) => void;
  regKey: string;
  setRegKey: (v: string) => void;
  regStatus: string | null;
  authError: string | null;
  setAuthError: (v: string | null) => void;
  handleAdminLogin: (e: React.FormEvent) => Promise<void>;
  handleShooterLogin: (e: React.FormEvent) => Promise<void>;
  handleShooterRegistration: (e: React.FormEvent) => Promise<void>;
}

export const PortalScreen = (props: Props) => {
  const isAr = props.language === "ar";

  return (
    <div className="flex-grow flex flex-col items-center justify-center p-4 relative overflow-hidden">
      {/* Static radar circles (exactly as before) */}
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[550px] h-[550px] border border-emerald-500/[0.04] dark:border-emerald-success/[0.07] rounded-full pointer-events-none select-none z-1 flex items-center justify-center">
        <div className="w-[380px] h-[380px] border border-emerald-500/[0.03] dark:border-emerald-success/[0.05] rounded-full flex items-center justify-center">
          <div className="w-1.5 h-1.5 bg-emerald-500/20 rounded-full animate-ping"></div>
        </div>
      </div>

      <div className="w-full max-w-md z-10">
        {/* Brand header */}
        <div className="text-center mb-6 select-none">
          <div className="mx-auto w-12 h-12 rounded-2xl bg-emerald-500/10 dark:bg-emerald-success/10 flex items-center justify-center border border-emerald-500/20 mb-3.5 shadow-sm">
            <Target className="w-6 h-6 text-emerald-500 animate-pulse" />
          </div>
          <h1 className="text-xl md:text-2xl font-black tracking-widest font-sans text-gray-800 dark:text-white uppercase">
            {props.t.brand}
          </h1>
          <p className="admin-text-sm font-mono text-gray-500 mt-1 select-none">
            {props.t.secureTerminal}
          </p>
        </div>

        {/* Auth error banner */}
        {props.authError && (
          <div className="mb-4 p-3 bg-rose-500/10 border border-rose-500/20 rounded-xl admin-text-sm font-mono font-bold text-rose-500 flex items-center gap-2">
            <ShieldAlert className="w-4 h-4 shrink-0" />
            <span>{props.authError}</span>
          </div>
        )}

        {/* STAGES */}
        {props.authStage === "PORTAL" && (
          <motion.div
            initial={{ opacity: 0, scale: 0.98 }}
            animate={{ opacity: 1, scale: 1 }}
            className="space-y-4"
          >
            <div
              className={`p-5 rounded-2xl border ${
                props.isDarkMode
                  ? "bg-[#121417] border-glass-border"
                  : "bg-white border-gray-200"
              }`}
            >
              <p className="text-center admin-text-sm font-mono text-gray-500 dark:text-gray-400 mb-4 select-none">
                {isAr
                  ? "يرجى تحديد قناة تسجيل الدخول المخصصة للولوج للمنظومة"
                  : "SELECT ACCESS ROAD TO INITIALIZE CONNECTION"}
              </p>

              <div className="grid grid-cols-1 gap-3">
                <button
                  onClick={() => {
                    props.setAuthStage("LOGIN_ADMIN");
                    props.setAuthError(null);
                  }}
                  className="group p-4 leading-relaxed rounded-xl text-left border cursor-pointer select-none transition-all duration-200 hover:shadow-md bg-transparent border-emerald-500/20 hover:border-emerald-500 hover:bg-emerald-500/[0.02]"
                >
                  <div className="flex items-center gap-2.5">
                    <div className="p-2 bg-emerald-500/10 text-emerald-500 rounded-lg group-hover:scale-105 transition-transform">
                      <Shield className="w-5 h-5" />
                    </div>
                    <div>
                      <span className="block font-sans admin-text-lg font-bold text-gray-800 dark:text-white">
                        {isAr
                          ? "مركز التحكم بالميدان (إدارة)"
                          : "Range Control Center"}
                      </span>
                      <span className="block font-mono admin-text-2xs text-gray-500 dark:text-gray-400 mt-0.5">
                        {isAr
                          ? "دخول برتبة مشرف أو معلم رماية (أدوات كاملة وسييطرة)"
                          : "Instructor and Range Officers panel with reports"}
                      </span>
                    </div>
                  </div>
                </button>

                <button
                  onClick={goToShooterScan}
                  className="group p-4 leading-relaxed rounded-xl text-left border cursor-pointer select-none transition-all duration-200 hover:shadow-md bg-transparent border-gray-200 dark:border-glass-border hover:border-emerald-500/50 hover:bg-emerald-500/[0.01]"
                >
                  <div className="flex items-center gap-2.5">
                    <div className="p-2 bg-gray-100 dark:bg-slate-surface text-gray-500 dark:text-gray-400 rounded-lg group-hover:scale-105 transition-transformFixed">
                      <User className="w-5 h-5" />
                    </div>
                    <div>
                      <span className="block font-sans admin-text-lg font-bold text-gray-800 dark:text-white">
                        {isAr
                          ? "جهاز الرماة اللوحي (رامٍ)"
                          : "Shooter Terminal"}
                      </span>
                      <span className="block font-mono admin-text-2xs text-gray-500 dark:text-gray-400 mt-0.5">
                        {isAr
                          ? "خاص بأجهزة الحارات واللوحات مقاس ١٠ بوصة للرماة"
                          : "Simplified target view, score records & logs"}
                      </span>
                    </div>
                  </div>
                </button>
              </div>
            </div>

            <div className="flex justify-center items-center gap-3">
              <LanguageSwitcher
                language={props.language}
                setLanguage={props.setLanguage}
              />
              <ThemeSwitcher
                isDarkMode={props.isDarkMode}
                setIsDarkMode={props.setIsDarkMode}
              />
            </div>
          </motion.div>
        )}

        {props.authStage === "LOGIN_ADMIN" && (
          <motion.div
            initial={{ opacity: 0, y: 15 }}
            animate={{ opacity: 1, y: 0 }}
            className={`p-5 rounded-2xl border shadow-lg ${
              props.isDarkMode
                ? "bg-[#121417] border-glass-border"
                : "bg-white border-gray-200"
            }`}
          >
            <div className="flex items-center gap-2 mb-4 select-none">
              <button
                onClick={() => props.setAuthStage("PORTAL")}
                className="p-1 rounded bg-transparent hover:bg-gray-100 dark:hover:bg-[#1C1F26] text-gray-500 dark:text-gray-400 cursor-pointer"
              >
                <ArrowLeft className="w-4 h-4" />
              </button>
              <h3 className="font-sans admin-text-lg font-bold text-gray-800 dark:text-white uppercase truncate">
                {isAr
                  ? "بوابة دخول المشرف والسيطرة"
                  : "Control Center Credentials"}
              </h3>
            </div>

            <form onSubmit={props.handleAdminLogin} className="space-y-4">
              <div>
                <label className="block font-mono admin-text-2xs uppercase text-gray-500 dark:text-gray-400 mb-1 font-bold select-none">
                  {isAr ? "معرف الضابط / المشرف" : "Officer Command Code"}
                </label>
                <div className="relative">
                  <Shield className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-500 dark:text-gray-400 pointer-events-none" />
                  <input
                    type="text"
                    value={props.adminFieldId}
                    onChange={(e) => props.setAdminFieldId(e.target.value)}
                    className="w-full pl-9 pr-3 py-2 border rounded-lg admin-text-sm font-mono bg-white dark:bg-transparent border-gray-200 dark:border-glass-border text-gray-800 dark:text-[#bccac1] focus:outline-none focus:border-emerald-500"
                    placeholder="admin"
                  />
                </div>
              </div>

              <div>
                <label className="block font-mono admin-text-2xs uppercase text-gray-500 dark:text-gray-400 mb-1 font-bold select-none">
                  {isAr ? "رمز الولوج السري" : "Instruction Passkey"}
                </label>
                <div className="relative">
                  <PasswordInput
                    value={props.adminFieldKey}
                    onChange={props.setAdminFieldKey}
                  />
                </div>
              </div>

              <button
                type="submit"
                className="w-full py-2.5 bg-emerald-500 hover:bg-emerald-400 text-white font-mono font-bold admin-text-sm rounded-xl shadow-sm cursor-pointer transition-colors"
              >
                {isAr ? "بدء تفويض المشرف العام" : "Authenticate Range Access"}
              </button>
            </form>
          </motion.div>
        )}

        {props.authStage === "LOGIN_SHOOTER" && (
          <motion.div
            initial={{ opacity: 0, y: 15 }}
            animate={{ opacity: 1, y: 0 }}
            className={`p-5 rounded-2xl border shadow-lg ${
              props.isDarkMode
                ? "bg-[#121417] border-glass-border"
                : "bg-white border-gray-200"
            }`}
          >
            <div className="flex items-center gap-2 mb-4 select-none">
              <button
                onClick={() => props.setAuthStage("PORTAL")}
                className="p-1 rounded bg-transparent hover:bg-gray-100 dark:hover:bg-[#1C1F26] text-gray-500 dark:text-gray-400 cursor-pointer"
              >
                <ArrowLeft className="w-4 h-4" />
              </button>
              <h3 className="font-sans admin-text-lg font-bold text-gray-800 dark:text-white uppercase truncate">
                {props.t.operatorAuth}
              </h3>
            </div>

            <form onSubmit={props.handleShooterLogin} className="space-y-4">
              <div>
                <label className="block font-mono admin-text-2xs uppercase text-gray-500 dark:text-gray-400 mb-1 font-bold select-none">
                  {props.t.username}
                </label>
                <div className="relative">
                  <User className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-500 dark:text-gray-400 pointer-events-none" />
                  <input
                    type="text"
                    value={props.shooterFieldId}
                    onChange={(e) => props.setShooterFieldId(e.target.value)}
                    className="w-full pl-9 pr-3 py-2 border rounded-lg admin-text-sm font-mono bg-white dark:bg-transparent border-gray-200 dark:border-glass-border text-gray-800 dark:text-[#bccac1] focus:outline-none focus:border-emerald-500"
                    placeholder="OP-1934-X"
                  />
                </div>
              </div>

              <div>
                <label className="block font-mono admin-text-2xs uppercase text-gray-500 dark:text-gray-400 mb-1 font-bold select-none">
                  {props.t.password}
                </label>
                <div className="relative">
                  <PasswordInput
                    value={props.shooterFieldKey}
                    onChange={props.setShooterFieldKey}
                  />
                </div>
              </div>

              <button
                type="submit"
                className="w-full py-2.5 bg-emerald-500 hover:bg-emerald-400 text-white font-mono font-bold admin-text-sm rounded-xl shadow-sm cursor-pointer transition-colors"
              >
                {props.t.initAccess}
              </button>

              <div className="text-center pt-2 select-none border-t border-gray-100 dark:border-glass-border/40 mt-3">
                <button
                  type="button"
                  onClick={() => props.setAuthStage("REGISTER_SHOOTER")}
                  className="admin-text-xs font-mono font-bold text-gray-500 dark:text-gray-400 hover:text-emerald-500 cursor-pointer"
                >
                  {props.t.regTacticalProfile}
                </button>
              </div>
            </form>
          </motion.div>
        )}

        {props.authStage === "REGISTER_SHOOTER" && (
          <motion.div
            initial={{ opacity: 0, y: 15 }}
            animate={{ opacity: 1, y: 0 }}
            className={`p-5 rounded-2xl border shadow-lg ${
              props.isDarkMode
                ? "bg-[#121417] border-glass-border"
                : "bg-white border-gray-200"
            }`}
          >
            <div className="flex items-center gap-2 mb-4 select-none">
              <button
                onClick={() => props.setAuthStage("LOGIN_SHOOTER")}
                className="p-1 rounded bg-transparent hover:bg-gray-100 dark:hover:bg-[#1C1F26] text-gray-500 dark:text-gray-400 cursor-pointer"
              >
                <ArrowLeft className="w-4 h-4" />
              </button>
              <h3 className="font-sans admin-text-lg font-bold text-gray-800 dark:text-white uppercase truncate">
                {props.t.operatorRegistration}
              </h3>
            </div>

            {props.regStatus && (
              <div className="mb-4 p-2.5 bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 admin-text-xs font-mono font-bold rounded-lg text-center">
                {props.regStatus}
              </div>
            )}

            <form
              onSubmit={props.handleShooterRegistration}
              className="space-y-4"
            >
              <div>
                <label className="block admin-text-2xs font-mono uppercase text-gray-500 dark:text-gray-400 mb-1 font-bold select-none">
                  {props.t.username}
                </label>
                <input
                  type="text"
                  required
                  value={props.regOpId}
                  onChange={(e) => props.setRegOpId(e.target.value)}
                  className="w-full px-3 py-2 border rounded-lg admin-text-sm font-mono bg-white dark:bg-transparent border-gray-200 dark:border-glass-border focus:outline-none focus:border-emerald-500"
                  placeholder="shooter3"
                />
              </div>

              <div>
                <label className="block admin-text-2xs font-mono uppercase text-gray-500 dark:text-gray-400 mb-1 font-bold select-none">
                  {props.t.regUnitAssignment}
                </label>
                <select
                  value={props.regUnit}
                  onChange={(e) => props.setRegUnit(e.target.value)}
                  className="w-full px-3 py-2 border rounded-lg admin-text-sm font-mono bg-gray-50 dark:bg-slate-surface text-gray-800 dark:text-gray-300 border-gray-300 dark:border-glass-border focus:outline-none focus:border-emerald-500"
                >
                  <option value="ALPHA SQUADRON">ALPHA SQUADRON</option>
                  <option value="DESERT COBRA">DESERT COBRA</option>
                  <option value="SUPPORT SQUAD">SUPPORT SQUAD</option>
                  <option value="NORTH SHIELD">NORTH SHIELD</option>
                </select>
              </div>

              <div>
                <label className="block admin-text-2xs font-mono uppercase text-gray-500 dark:text-gray-400 mb-1 font-bold select-none">
                  {props.t.password}
                </label>
                <PasswordInput
                  value={props.regKey}
                  onChange={props.setRegKey}
                  required
                  showLockIcon={false}
                />
              </div>

              <p className="admin-text-sm text-gray-500 dark:text-gray-400 font-mono select-none leading-normal">
                {props.t.acknowledgedText}
              </p>

              <button
                type="submit"
                className="w-full py-2.5 bg-emerald-500 hover:bg-emerald-400 text-white font-mono font-bold admin-text-sm rounded-xl shadow-sm cursor-pointer transition-colors"
              >
                {props.t.createProfile}
              </button>
            </form>
          </motion.div>
        )}
      </div>
    </div>
  );
};
