import React, { useState } from "react";
import { Eye, EyeOff, Lock } from "lucide-react";

interface PasswordInputProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  required?: boolean;
  showLockIcon?: boolean;
  className?: string;
}

export const PasswordInput: React.FC<PasswordInputProps> = ({
  value,
  onChange,
  placeholder = "••••••••",
  required = false,
  showLockIcon = true,
  className = "",
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
        className={`w-full ${padding} py-2 border rounded-lg admin-text-sm font-mono bg-white dark:bg-transparent border-gray-200 dark:border-glass-border text-gray-800 dark:text-[#bccac1] focus:outline-none focus:border-emerald-500 ${className}`}
        placeholder={placeholder}
      />
      <button
        type="button"
        onClick={() => setVisible((v) => !v)}
        className="absolute right-2 top-1/2 -translate-y-1/2 p-1 rounded text-gray-500 dark:text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 cursor-pointer"
        aria-label={visible ? "Hide password" : "Show password"}
        tabIndex={-1}
      >
        {visible ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
      </button>
    </div>
  );
};
