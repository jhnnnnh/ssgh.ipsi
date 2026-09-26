"use client";

import type { ReactNode } from "react";
import { Tabs, type TabItem } from "@/components/ui/Tabs";

/** 학생·교사·전체관리자가 공유하는 앱 이름, 주요 탭, 계정 도구 머리글. */
export function DashboardHeader({
  context,
  items,
  active,
  onChange,
  actions,
}: {
  context: string;
  items: TabItem[];
  active: string;
  onChange: (key: string) => void;
  actions: ReactNode;
}) {
  return (
    <header className="app-header">
      <div className="app-header-brand">
        <span className="app-name">삼성여고 2026 입시</span>
        <span className="app-context">{context}</span>
      </div>
      <Tabs items={items} active={active} onChange={onChange} />
      <div className="app-header-actions">{actions}</div>
    </header>
  );
}
