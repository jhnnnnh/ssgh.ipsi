"use client";

import { cn } from "@/lib/cn";
import { formatDateLabel } from "@/lib/time";

export function DateTabs({
  dates,
  selected,
  onSelect,
}: {
  dates: string[];
  selected: string | null;
  onSelect: (date: string) => void;
}) {
  if (dates.length === 0) return null;
  return (
    <div className="segmented max-w-full" role="group" aria-label="날짜 선택">
      {dates.map((d) => (
        <button
          key={d}
          type="button"
          onClick={() => onSelect(d)}
          className={cn(
            "segmented-tab",
            selected === d
              ? "active"
              : "",
          )}
        >
          {formatDateLabel(d)}
        </button>
      ))}
    </div>
  );
}
