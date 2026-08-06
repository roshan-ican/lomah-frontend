import React from "react";
import { Sun, Moon } from "lucide-react";

interface ThemeSwitcherProps {
  isDarkMode: boolean;
  setIsDarkMode: (val: boolean) => void;
}

export const ThemeSwitcher: React.FC<ThemeSwitcherProps> = ({
  isDarkMode,
  setIsDarkMode,
}) => {
  return (
    <button
      onClick={() => setIsDarkMode(!isDarkMode)}
      className="touch-target inline-flex items-center justify-center rounded border transition-all border-gray-200 dark:border-glass-border text-orange-600 dark:text-yellow-400 bg-white dark:bg-[#1C1F26] hover:bg-gray-100 dark:hover:bg-[#2A2E37]"
      title={isDarkMode ? "Switch to Light Mode" : "Switch to Dark Mode"}
    >
      {isDarkMode ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
    </button>
  );
};
