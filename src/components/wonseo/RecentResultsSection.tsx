"use client";

import { RecentResultsTable } from "@/components/wonseo/RecentResultsTable";
import type { RecentResultYear } from "@/lib/database.types";

/**
 * 카드 목록에서 최근 입결을 조회만 하는 표시 영역. 예전엔 카드마다 따로 펼치고 접었는데,
 * 지금은 목록 상단의 전체 on/off 버튼(WonseoTab/WonseoManageTab)이 모든 카드에 똑같이
 * 적용한다. 실제 입력/수정은 카드 수정 모달에서 이뤄진다.
 */
export function RecentResultsSection({ years, open }: { years: RecentResultYear[]; open: boolean }) {
  if (!open) return null;
  return (
    <div className="border-t border-slate-100 pt-3">
      <RecentResultsTable years={years} />
    </div>
  );
}
