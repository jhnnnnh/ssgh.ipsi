"use client";

import { useCallback, useEffect, useState } from "react";

/** 현재 탭을 URL hash에 기록해 새로고침과 브라우저 뒤로 가기 후에도 복원한다. */
export function useHashTab<T extends string>(defaultTab: T, allowedTabs: readonly T[]) {
  const allowedKey = allowedTabs.join("|");
  const [activeTab, setActiveTab] = useState<T>(defaultTab);

  useEffect(() => {
    const allowed = new Set(allowedKey.split("|"));
    const syncFromHash = () => {
      let requestedTab = window.location.hash.slice(1);
      if (!requestedTab) {
        setActiveTab(defaultTab);
        return;
      }

      try {
        requestedTab = decodeURIComponent(requestedTab);
      } catch {
        return;
      }
      if (allowed.has(requestedTab)) {
        setActiveTab(requestedTab as T);
      }
    };

    syncFromHash();
    window.addEventListener("popstate", syncFromHash);
    window.addEventListener("hashchange", syncFromHash);
    return () => {
      window.removeEventListener("popstate", syncFromHash);
      window.removeEventListener("hashchange", syncFromHash);
    };
  }, [allowedKey, defaultTab]);

  const selectTab = useCallback(
    (tab: T) => {
      if (!allowedKey.split("|").includes(tab)) return;
      const url = new URL(window.location.href);
      if (url.hash !== `#${tab}`) {
        url.hash = tab;
        window.history.pushState(null, "", url);
      }
      setActiveTab(tab);
    },
    [allowedKey],
  );

  return [activeTab, selectTab] as const;
}
