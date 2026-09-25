import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

/**
 * 탭 화면(상담 신청 현황/수시 원서 관리/입시 일정/학생 명단 관리 등)을 감싸는 흰색 카드.
 * 예전에는 탭마다 이 스타일을 따로 적어 넣어서 테두리·둥근 정도·안쪽 여백이 조금씩 어긋나
 * 있었다(특히 학생 명단 관리는 바깥 카드에 패딩이 아예 없었다). 이제 모든 탭이 이 컴포넌트
 * 하나를 재사용해서 경계·모서리·기본 패딩이 항상 같은 기준을 따른다.
 *
 * 표처럼 가로 스크롤이 필요한 콘텐츠는 padded={false}로 바깥 패딩을 빼고, 안쪽에서
 * 필요한 부분(예: 표 위 헤더 줄)에만 직접 여백을 줘도 패널 경계는 그대로
 * 공유된다.
 */
export function Card({
  children,
  className,
  padded = true,
}: {
  children: ReactNode;
  className?: string;
  padded?: boolean;
}) {
  return (
    <div
      className={cn(
        "bg-white rounded-3xl border border-slate-200 overflow-hidden",
        padded && "p-4 sm:p-5",
        className,
      )}
    >
      {children}
    </div>
  );
}
