import React from "react";

export interface MobileRangeTab {
  id: string;
  label: string;
}

interface MobileRangeTabBarProps {
  tabs: MobileRangeTab[];
  active: string;
  onChange: (id: string) => void;
}

export const MobileRangeTabBar: React.FC<MobileRangeTabBarProps> = ({
  tabs,
  active,
  onChange,
}) => {
  return (
    <nav
      className="mobile-range-tabbar lg:hidden shrink-0 border-t border-hud bg-hud-rail safe-area-bottom"
      aria-label="View switcher"
    >
      <div className="flex">
        {tabs.map((tab) => {
          const isActive = tab.id === active;
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => onChange(tab.id)}
              className={`mobile-range-tab touch-target flex-1 px-2 py-2 text-center transition-colors cursor-pointer ${
                isActive ? "mobile-range-tab--active" : "mobile-range-tab--idle"
              }`}
            >
              <span className="range-display-label tracking-[0.14em]">
                {tab.label}
              </span>
            </button>
          );
        })}
      </div>
    </nav>
  );
};
