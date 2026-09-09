"use client";

import { useEffect, useState } from "react";
import { Plus, Star, Trash2 } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useToast } from "@/components/providers/ToastProvider";
import type { ScheduleEvent, WonseoCard } from "@/lib/database.types";

type CardDraft = { applicationNumber: string; scheduleEvents: ScheduleEvent[] };

function draftFromCard(card: WonseoCard): CardDraft {
  return {
    applicationNumber: card.application_number ?? "",
    scheduleEvents: card.schedule_events ?? [],
  };
}

/**
 * "접수한 원서"(별표) 카드만 모아, 학교/학과/전형과 수험번호·일정(자유 추가)만 보여주고
 * 편집하는 화면. 모집정보·입결 등은 여기서는 보여주지 않는다(WonseoCardView와는 별개의
 * 단순화된 뷰). 필드는 blur 시점에 그 카드의 수험번호+일정 전체를 한 번에 저장한다.
 */
export function SubmittedApplicationsPanel({ cards }: { cards: WonseoCard[] }) {
  const showToast = useToast();
  const [drafts, setDrafts] = useState<Record<string, CardDraft>>({});

  useEffect(() => {
    // 다른 곳에서 카드가 갱신돼도(예: 별표 해제로 목록에서 빠짐) 이미 손대던 초안은
    // 유지하고, 새로 들어온 카드만 원본 값으로 채운다.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setDrafts((prev) => {
      const next: Record<string, CardDraft> = {};
      for (const card of cards) {
        next[card.id] = prev[card.id] ?? draftFromCard(card);
      }
      return next;
    });
  }, [cards]);

  function updateDraft(cardId: string, patch: Partial<CardDraft>) {
    setDrafts((prev) => ({ ...prev, [cardId]: { ...prev[cardId], ...patch } }));
  }

  async function persist(cardId: string, draft: CardDraft | undefined) {
    if (!draft) return;
    const supabase = createClient();
    const { error } = await supabase
      .from("wonseo_cards")
      .update({
        application_number: draft.applicationNumber.trim() || null,
        schedule_events: draft.scheduleEvents,
      })
      .eq("id", cardId);
    if (error) showToast("저장에 실패했습니다.", "error");
  }

  function addSchedule(cardId: string) {
    const draft = drafts[cardId];
    if (!draft) return;
    updateDraft(cardId, { scheduleEvents: [...draft.scheduleEvents, { label: "", date: "" }] });
  }

  function removeSchedule(cardId: string, index: number) {
    const draft = drafts[cardId];
    if (!draft) return;
    const scheduleEvents = draft.scheduleEvents.filter((_, i) => i !== index);
    updateDraft(cardId, { scheduleEvents });
    void persist(cardId, { ...draft, scheduleEvents });
  }

  function updateScheduleField(cardId: string, index: number, key: "label" | "date", value: string) {
    const draft = drafts[cardId];
    if (!draft) return;
    const scheduleEvents = draft.scheduleEvents.map((s, i) => (i === index ? { ...s, [key]: value } : s));
    updateDraft(cardId, { scheduleEvents });
  }

  if (cards.length === 0) {
    return (
      <div className="bg-white rounded-3xl p-12 text-center border border-amber-200 space-y-2">
        <div className="w-16 h-16 bg-amber-50 text-amber-500 rounded-3xl flex items-center justify-center mx-auto shadow-xs">
          <Star className="w-6 h-6" />
        </div>
        <h4 className="text-sm font-bold text-slate-800">별표로 표시한 접수 원서가 없습니다.</h4>
        <p className="text-xs text-slate-400 max-w-sm mx-auto leading-relaxed">
          카드 우측 상단의 별 아이콘을 눌러, 실제로 접수한 원서를 표시해 주세요.
        </p>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
      {cards.map((card) => {
        const draft = drafts[card.id] ?? draftFromCard(card);
        return (
          <div key={card.id} className="bg-white rounded-3xl border-2 border-amber-200 shadow-sm p-5 space-y-3.5">
            <div className="space-y-1.5">
              <div className="flex items-baseline gap-2 min-w-0">
                <h4 className="text-base font-bold text-slate-900 truncate shrink-0" style={{ maxWidth: "58%" }}>
                  {card.university}
                </h4>
                <span className="text-base font-bold text-slate-900 truncate min-w-0">{card.department}</span>
              </div>
              <div className="flex flex-wrap gap-1.5 text-xs font-bold">
                <span className="border border-slate-300 text-slate-700 px-2 py-1 rounded-lg">{card.category}</span>
                {card.sub_category && (
                  <span className="border border-slate-300 text-slate-700 px-2 py-1 rounded-lg">{card.sub_category}</span>
                )}
              </div>
            </div>

            <div>
              <label className="block text-[11px] font-bold text-slate-500 mb-1">수험번호</label>
              <input
                value={draft.applicationNumber}
                onChange={(e) => updateDraft(card.id, { applicationNumber: e.target.value })}
                onBlur={() => persist(card.id, drafts[card.id])}
                placeholder="수험번호 입력"
                className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3 py-2 text-sm font-semibold text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>

            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <label className="text-[11px] font-bold text-slate-500">
                  일정 <span className="font-normal text-slate-400">(논술·면접·발표 등)</span>
                </label>
                <button
                  type="button"
                  onClick={() => addSchedule(card.id)}
                  className="px-2 py-0.5 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-lg text-[11px] font-bold flex items-center gap-1"
                >
                  <Plus className="w-3 h-3" />
                  추가
                </button>
              </div>
              {draft.scheduleEvents.length === 0 && <p className="text-[11px] text-slate-400">등록된 일정이 없어요.</p>}
              <div className="space-y-1.5">
                {draft.scheduleEvents.map((s, i) => (
                  <div key={i} className="flex items-center gap-1.5">
                    <input
                      value={s.label}
                      onChange={(e) => updateScheduleField(card.id, i, "label", e.target.value)}
                      onBlur={() => persist(card.id, drafts[card.id])}
                      placeholder="예: 논술, 1차 발표"
                      className="flex-1 min-w-0 bg-slate-50 border border-slate-300 rounded-lg px-2 py-1.5 text-xs font-semibold text-slate-800 focus:outline-none focus:ring-1 focus:ring-indigo-400"
                    />
                    <input
                      type="date"
                      value={s.date}
                      onChange={(e) => updateScheduleField(card.id, i, "date", e.target.value)}
                      onBlur={() => persist(card.id, drafts[card.id])}
                      className="w-[132px] shrink-0 bg-slate-50 border border-slate-300 rounded-lg px-2 py-1.5 text-xs font-semibold text-slate-800 focus:outline-none focus:ring-1 focus:ring-indigo-400"
                    />
                    <button
                      type="button"
                      onClick={() => removeSchedule(card.id, i)}
                      className="w-7 h-7 shrink-0 rounded-lg bg-rose-50 hover:bg-rose-100 text-rose-500 flex items-center justify-center"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
