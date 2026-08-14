// src/components/auth/AdminLoginForm.tsx
import { useState } from "react";
import { motion } from "motion/react";
import { Shield, ArrowLeft } from "lucide-react";
import { PasswordInput } from "../common/PasswordInput";
import { TranslationSet } from "../../translations";

interface Props {
  isDarkMode: boolean;
  isAr: boolean;
  t: TranslationSet;
  onBack: () => void;
  onSubmit: (username: string, password: string) => Promise<void>;
}

export function AdminLoginForm({
  isDarkMode,
  isAr,
  t,
  onBack,
  onSubmit,
}: Props) {
  const [username, setUsername] = useState("admin");
  const [password, setPassword] = useState("");

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    void onSubmit(username, password);
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
          className="p-1 rounded bg-transparent hover:bg-gray-100 dark:hover:bg-[#1C1F26] text-gray-500 dark:text-gray-400 cursor-pointer"
        >
          <ArrowLeft className="w-4 h-4" />
        </button>
        <h3 className="font-sans admin-text-lg font-bold text-gray-800 dark:text-white uppercase truncate">
          {isAr ? "بوابة دخول المشرف والسيطرة" : "Control Center Credentials"}
        </h3>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="block font-mono admin-text-2xs uppercase text-gray-500 dark:text-gray-400 mb-1 font-bold select-none">
            {t.username}
          </label>
          <div className="relative">
            <Shield className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-500 dark:text-gray-400 pointer-events-none" />
            <input
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              className="w-full pl-9 pr-3 py-2 border rounded-lg admin-text-sm font-mono bg-white dark:bg-transparent border-gray-200 dark:border-glass-border text-gray-800 dark:text-[#bccac1] focus:outline-none focus:border-emerald-500"
              placeholder="admin"
            />
          </div>
        </div>

        <div>
          <label className="block font-mono admin-text-2xs uppercase text-gray-500 dark:text-gray-400 mb-1 font-bold select-none">
            {t.password}
          </label>
          <PasswordInput value={password} onChange={setPassword} />
        </div>

        <button
          type="submit"
          className="w-full py-2.5 bg-emerald-500 hover:bg-emerald-400 text-white font-mono font-bold admin-text-sm rounded-xl shadow-sm cursor-pointer transition-colors"
        >
          {isAr ? "بدء تفويض المشرف العام" : "Authenticate Range Access"}
        </button>
      </form>
    </motion.div>
  );
}
