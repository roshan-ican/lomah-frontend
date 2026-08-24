import React, { useState } from "react";
import { Eye, EyeOff, Lock } from "lucide-react";

interface PasswordInputProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  required?: boolean;
  showLockIcon?: boolean;
  className?: string;
  /**
   * Replaces the default skin outright rather than appending to it. The HUD
   * console styles inputs with `hud-form-input`, whose colours the defaults
   * below would fight — and which of the two wins is decided by stylesheet
   * order, not by what is passed here.
   */
  inputClassName?: string;
  disabled?: boolean;
  autoComplete?: string;
}

const DEFAULT_SKIN =
  "border rounded-lg admin-text-sm font-mono bg-white dark:bg-transparent border-gray-200 dark:border-glass-border text-gray-800 dark:text-[#bccac1] focus:outline-none focus:border-emerald-500";

export const PasswordInput: React.FC<PasswordInputProps> = ({
  value,
  onChange,
  placeholder = "••••••••",
  required = false,
  showLockIcon = true,
  className = "",
  inputClassName,
  disabled = false,
  autoComplete,
}) => {
  const [visible, setVisible] = useState(false);

  const padding = showLockIcon ? "pl-9 pr-9" : "pl-3 pr-9";

  return (
    <div className="relative">
      {showLockIcon && (
        <Lock className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-500 dark:text-gray-400 pointer-events-none" />
      )}
      <input
        type={visible ? "text" : "password"}
        value={value}
        required={required}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
        autoComplete={autoComplete}
        className={`w-full ${padding} py-2 ${inputClassName ?? DEFAULT_SKIN} ${className}`}
        placeholder={placeholder}
      />
      <button
        type="button"
        onClick={() => setVisible((v) => !v)}
        disabled={disabled}
        className="absolute right-2 top-1/2 -translate-y-1/2 p-1 rounded text-gray-500 dark:text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 cursor-pointer disabled:opacity-50"
        aria-label={visible ? "Hide password" : "Show password"}
        tabIndex={-1}
      >
        {visible ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
      </button>
    </div>
  );
};
