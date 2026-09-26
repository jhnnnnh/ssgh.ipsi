"use client";

import { useEffect, useRef } from "react";

export interface TabItem {
  key: string;
  label: string;
}

export function Tabs({
  items,
  active,
  onChange,
}: {
  items: TabItem[];
  active: string;
  onChange: (key: string) => void;
}) {
  const tabRefs = useRef<Array<HTMLButtonElement | null>>([]);

  useEffect(() => {
    const activeIndex = items.findIndex((item) => item.key === active);
    if (activeIndex >= 0) {
      tabRefs.current[activeIndex]?.scrollIntoView({ block: "nearest", inline: "nearest" });
    }
  }, [active, items]);

  function moveFocus(currentIndex: number, key: string, event: React.KeyboardEvent<HTMLButtonElement>) {
    let nextIndex = currentIndex;
    if (key === "ArrowRight") nextIndex = (currentIndex + 1) % items.length;
    else if (key === "ArrowLeft") nextIndex = (currentIndex - 1 + items.length) % items.length;
    else if (key === "Home") nextIndex = 0;
    else if (key === "End") nextIndex = items.length - 1;
    else return;

    event.preventDefault();
    const nextTab = items[nextIndex];
    tabRefs.current[nextIndex]?.focus();
    tabRefs.current[nextIndex]?.scrollIntoView({ block: "nearest", inline: "nearest" });
    onChange(nextTab.key);
  }

  return (
    <nav className="app-header-tabs" aria-label="주요 화면">
      <div className="segmented app-tabs" role="tablist" aria-label="주요 화면">
        {items.map((item, index) => {
          const selected = active === item.key;
          return (
            <button
              key={item.key}
              ref={(element) => {
                tabRefs.current[index] = element;
              }}
              id={`app-tab-${item.key}`}
              type="button"
              role="tab"
              aria-selected={selected}
              aria-controls="app-tab-panel"
              tabIndex={selected ? 0 : -1}
              className={selected ? "segmented-tab active" : "segmented-tab"}
              onClick={(event) => {
                event.currentTarget.scrollIntoView({ block: "nearest", inline: "nearest" });
                onChange(item.key);
              }}
              onKeyDown={(event) => moveFocus(index, event.key, event)}
            >
              {item.label}
            </button>
          );
        })}
      </div>
    </nav>
  );
}
