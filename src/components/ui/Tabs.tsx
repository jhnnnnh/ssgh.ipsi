"use client";

import { cn } from "@/lib/cn";

export interface TabItem {
  key: string;
  label: string;
  icon: React.ReactNode;
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
  return (
    <nav className="-mx-4 sm:mx-0 border-b border-slate-200">
      <div className="flex w-full gap-1 overflow-x-auto overflow-y-hidden px-4 sm:px-0 text-sm sm:text-base whitespace-nowrap pt-1 scroll-area">
      {items.map((item) => (
        <button
          key={item.key}
          onClick={() => onChange(item.key)}
          className={cn(
            "min-h-11 shrink-0 px-3 sm:px-4 border-b-2 flex items-center gap-2 transition-colors duration-150",
            active === item.key
              ? "border-indigo-600 text-indigo-800 font-bold emphasis-title"
              : "border-transparent text-slate-600 hover:text-slate-900 hover:bg-slate-50",
          )}
        >
          {item.icon}
          <span>{item.label}</span>
        </button>
      ))}
      </div>
    </nav>
  );
}
