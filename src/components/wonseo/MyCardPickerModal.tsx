"use client";

import { X, FileText } from "lucide-react";
import { LEVEL_EMPHASIS_STYLE } from "@/lib/wonseo-constants";
import type { SupportLevel } from "@/lib/database.types";

export type PickableCard = {
  id: string;
  university: string | null;
  department: string | null;
  category: string;
  sub_category: string | null;
  level: SupportLevel;
};

/**
 * "내 원서 카드에서 불러오기"를 <select> 대신 카드 목록 팝업으로 보여준다. 수시 원서
 * 관리 탭의 카드와 같은 모양(지원 등급별 테두리·색상 막대)을 쓰되, 여기서는 조회용
 * 검색폼을 채우는 용도라 대학·학과·전형명만 보여준다.
 */
export function MyCardPickerModal<T extends PickableCard>({
  open,
  onClose,
  cards,
  onPick,
}: {
  open: boolean;
  onClose: () => void;
  cards: T[];
  onPick: (card: T) => void;
}) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 bg-slate-950/60 backdrop-blur-sm z-[95] flex items-center justify-center p-4" onClick={onClose}>
      <div
        className="bg-white rounded-3xl shadow-2xl max-w-2xl w-full max-h-[80vh] overflow-hidden flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
          <h3 className="text-sm font-bold text-slate-900">내 원서 카드에서 불러오기</h3>
          <button onClick={onClose} className="w-8 h-8 rounded-lg hover:bg-slate-100 flex items-center justify-center text-slate-400">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-5 overflow-y-auto">
          {cards.length === 0 ? (
            <p className="text-center text-xs text-slate-400 py-10">등록된 원서 카드가 없어요.</p>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {cards.map((card) => {
                const emphasis = LEVEL_EMPHASIS_STYLE[card.level];
                return (
                  <button
                    key={card.id}
                    type="button"
                    onClick={() => {
                      onPick(card);
                      onClose();
                    }}
                    className={`text-left bg-white rounded-2xl border-2 ${emphasis.border} shadow-sm hover:shadow-md transition overflow-hidden flex`}
                  >
                    <div className={`w-1.5 shrink-0 ${emphasis.bar}`} />
                    <div className="flex-1 p-3.5 space-y-1.5 min-w-0">
                      <span className={`inline-block text-[10px] font-bold px-2 py-0.5 rounded-lg ${emphasis.badge}`}>
                        {card.level}
                      </span>
                      <h4 className="font-bold text-slate-900 text-sm truncate">
                        {card.university} {card.department}
                      </h4>
                      <p className="text-[11px] text-slate-500 flex items-center gap-1 truncate">
                        <FileText className="w-3 h-3 shrink-0" />
                        {card.category}
                        {card.sub_category ? ` · ${card.sub_category}` : ""}
                      </p>
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
