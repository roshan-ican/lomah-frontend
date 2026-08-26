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
  const nextThemeLabel = isDarkMode
    ? "Switch to light mode"
    : "Switch to dark mode";

  return (
    <button
      type="button"
      onClick={() => setIsDarkMode(!isDarkMode)}
      className="theme-switcher touch-target"
      aria-label={nextThemeLabel}
      title={nextThemeLabel}
    >
      <span className="theme-switcher__icons" aria-hidden="true">
        <Sun
          className="theme-switcher__icon"
          data-active={isDarkMode ? "true" : "false"}
        />
        <Moon
          className="theme-switcher__icon"
          data-active={isDarkMode ? "false" : "true"}
        />
      </span>
    </button>
  );
};
