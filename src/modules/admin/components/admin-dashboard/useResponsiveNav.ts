import { useEffect, useState } from "react";
import type { AdminTab } from "./types";

/**
 * Drives the sidebar nav: open by default on md+ viewports, collapsed on
 * mobile, and auto-closing after a tab is chosen on small screens.
 */
export function useResponsiveNav(setActiveTab: (tab: AdminTab) => void) {
  const [navOpen, setNavOpen] = useState(false);

  useEffect(() => {
    const mq = window.matchMedia("(min-width: 768px)");
    const handleViewPortChange = () => {
      if (!mq.matches) setNavOpen(false)
    }

    mq.addEventListener("change", handleViewPortChange);
    return () => mq.removeEventListener("change", handleViewPortChange);
  }, []);

  const selectTab = (tab: AdminTab) => {
    setActiveTab(tab);
    if (window.innerWidth < 768) setNavOpen(false);
  };

  return { navOpen, setNavOpen, selectTab };
}
