// src/components/auth/ShooterRegisterForm.tsx
import { useState } from "react";
import { motion } from "motion/react";
import { ArrowLeft } from "lucide-react";
import { PasswordInput } from "../common/PasswordInput";
import { TranslationSet } from "../../translations";

interface Props {
  isDarkMode: boolean;
  isAr: boolean;
  t: TranslationSet;
  onBack: () => void;
  onSubmit: (username: string, unit: string, password: string) => Promise<void>;
}

export function ShooterRegisterForm({
  isDarkMode,
  isAr,
  t,
  onBack,
  onSubmit,
}: Props) {
  const [username, setUsername] = useState("");
  const [unit, setUnit] = useState("ALPHA SQUADRON");
  const [password, setPassword] = useState("");
  const [regStatus, setRegStatus] = useState<string | null>(null);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    void onSubmit(username, unit, password);
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 15 }}
      animate={{ opacity: 1, y: 0 }}
      className={`p-5 rounded-2xl border shadow-lg ${
        isDarkMode
          ? "bg-[#121417] border-glass-border"
          : "bg-white border-gray-200"
      }`}
    >
      <div className="flex items-center gap-2 mb-4 select-none">
        <button
          onClick={onBack}
          className="p-1 rounded bg-transparent hover:bg-gray-100 dark:hover:bg-[#1C1F26] text-gray-400 cursor-pointer"
        >
          <ArrowLeft className="w-4 h-4" />
        </button>
        <h3 className="font-sans admin-text-lg font-bold text-gray-800 dark:text-white uppercase truncate">
          {t.operatorRegistration}
        </h3>
      </div>

      {regStatus && (
        <div className="mb-4 p-2.5 bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 admin-text-xs font-mono font-bold rounded-lg text-center">
          {regStatus}
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="block admin-text-2xs font-mono uppercase text-gray-400 mb-1 font-bold select-none">
            {t.username}
          </label>
          <input
            type="text"
            required
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            className="w-full px-3 py-2 border rounded-lg admin-text-sm font-mono bg-white dark:bg-transparent border-gray-200 dark:border-glass-border focus:outline-none focus:border-emerald-500"
            placeholder="shooter3"
          />
        </div>

        <div>
          <label className="block admin-text-2xs font-mono uppercase text-gray-400 mb-1 font-bold select-none">
            {t.regUnitAssignment}
          </label>
          <select
            value={unit}
            onChange={(e) => setUnit(e.target.value)}
            className="w-full px-3 py-2 border rounded-lg admin-text-sm font-mono bg-gray-50 dark:bg-slate-surface text-gray-800 dark:text-gray-300 border-gray-300 dark:border-glass-border focus:outline-none focus:border-emerald-500"
          >
            <option value="ALPHA SQUADRON">ALPHA SQUADRON</option>
            <option value="DESERT COBRA">DESERT COBRA</option>
            <option value="SUPPORT SQUAD">SUPPORT SQUAD</option>
            <option value="NORTH SHIELD">NORTH SHIELD</option>
          </select>
        </div>

        <div>
          <label className="block admin-text-2xs font-mono uppercase text-gray-400 mb-1 font-bold select-none">
            {t.password}
          </label>
          <PasswordInput
            value={password}
            onChange={setPassword}
            required
            showLockIcon={false}
          />
        </div>

        <p className="admin-text-sm text-gray-400 font-mono select-none leading-normal">
          {t.acknowledgedText}
        </p>

        <button
          type="submit"
          className="w-full py-2.5 bg-emerald-500 hover:bg-emerald-400 text-white font-mono font-bold admin-text-sm rounded-xl shadow-sm cursor-pointer transition-colors"
        >
          {t.createProfile}
        </button>
      </form>
    </motion.div>
  );
}
