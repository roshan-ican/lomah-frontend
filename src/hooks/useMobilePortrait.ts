import { useEffect, useState } from "react";

/** True on phone-sized portrait viewports where we use tab panes instead of split layout. */
export function useMobilePortrait(): boolean {
  const [matches, setMatches] = useState(() => {
    if (typeof window === "undefined") return false;
    return window.matchMedia("(max-width: 767px) and (orientation: portrait)")
      .matches;
  });

  useEffect(() => {
    const mq = window.matchMedia(
      "(max-width: 767px) and (orientation: portrait)",
    );
    const sync = () => setMatches(mq.matches);
    sync();
    mq.addEventListener("change", sync);
    return () => mq.removeEventListener("change", sync);
  }, []);

  return matches;
}
