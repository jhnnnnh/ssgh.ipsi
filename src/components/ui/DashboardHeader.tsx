"use client";

/** 학생/교사 화면 상단에 공통으로 쓰는 헤더 박스. 아이콘 + 본문(이름 등) + 우측 액션 버튼들로 구성한다. */
export function DashboardHeader({
  icon,
  actions,
  children,
}: {
  icon: React.ReactNode;
  actions: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 border-b border-slate-200 pb-4">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-lg bg-indigo-50 text-indigo-700 flex items-center justify-center shrink-0">
          {icon}
        </div>
        <div>{children}</div>
      </div>
      <div className="flex items-center gap-2 self-end sm:self-auto flex-wrap">{actions}</div>
    </div>
  );
}
