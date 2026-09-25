"use client";

import { useState } from "react";
import { Bookmark, Settings, Star, Trash2 } from "lucide-react";
import { Modal } from "@/components/ui/Modal";
import { createClient } from "@/lib/supabase/client";
import { useToast } from "@/components/providers/ToastProvider";
import { useActiveClass } from "@/components/providers/ActiveClassProvider";
import { autoFormatTime, isValidTime, addMinutesToTime, formatTime } from "@/lib/time";
import type { FavoriteCategory, SlotFavorite } from "@/lib/database.types";

const FIELD_CLASS =
  "w-full bg-slate-50 border border-slate-300 rounded-xl px-3.5 py-2.5 text-xs font-semibold text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500";
const BUTTON_CLASS =
  "px-5 py-2.5 bg-slate-800 hover:bg-slate-900 text-white rounded-xl text-xs font-bold transition shadow-xs flex items-center justify-center gap-2";
const LABEL_CLASS = "block text-xs font-bold text-slate-600 mb-1";

export function FavoritesSettingsModal({
  open,
  onClose,
  favorites,
  reload,
}: {
  open: boolean;
  onClose: () => void;
  favorites: SlotFavorite[];
  reload: () => void;
}) {
  const showToast = useToast();
  const { grade, classNo } = useActiveClass();
  const [favCategory, setFavCategory] = useState<FavoriteCategory>("weekday");
  const [favStart, setFavStart] = useState("");
  const [favEnd, setFavEnd] = useState("");

  const weekdayFavorites = favorites.filter((f) => f.category === "weekday");
  const weekendFavorites = favorites.filter((f) => f.category === "weekend");

  async function addFavoriteSlot() {
    if (grade == null || classNo == null) {
      showToast("반 정보를 확인할 수 없습니다.", "error");
      return;
    }
    if (!isValidTime(favStart) || !isValidTime(favEnd)) {
      showToast("즐겨찾기 시간을 HH:MM 형식으로 입력해 주세요.", "error");
      return;
    }
    const supabase = createClient();
    const { error } = await supabase.from("slot_favorites").insert({
      category: favCategory,
      start_time: favStart,
      end_time: favEnd,
      grade,
      class_no: classNo,
    });
    if (error) {
      showToast("즐겨찾기 추가에 실패했습니다.", "error");
      return;
    }
    showToast("즐겨찾기가 추가되었습니다.", "success");
    setFavStart("");
    setFavEnd("");
    reload();
  }

  async function removeFavorite(id: string) {
    const supabase = createClient();
    await supabase.from("slot_favorites").delete().eq("id", id);
    reload();
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="즐겨찾기 설정"
      icon={<Settings className="w-4 h-4 text-indigo-600" />}
      maxWidth="max-w-lg"
      footer={
        <button
          onClick={onClose}
          className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold transition shadow-xs"
        >
          닫기
        </button>
      }
    >
      <FavoriteGroup label="평일 즐겨찾기" items={weekdayFavorites} onRemove={removeFavorite} />
      <FavoriteGroup label="휴일 즐겨찾기" items={weekendFavorites} onRemove={removeFavorite} />

      <div className="pt-2 border-t border-slate-100 grid grid-cols-1 sm:grid-cols-4 gap-3 items-end">
        <div>
          <label className={LABEL_CLASS}>구분</label>
          <select
            value={favCategory}
            onChange={(e) => setFavCategory(e.target.value as FavoriteCategory)}
            className={`${FIELD_CLASS} font-bold`}
          >
            <option value="weekday">평일</option>
            <option value="weekend">휴일</option>
          </select>
        </div>
        <div>
          <label className={LABEL_CLASS}>시작 시간</label>
          <input
            value={favStart}
            onChange={(e) => {
              const v = autoFormatTime(e.target.value);
              setFavStart(v);
              if (isValidTime(v) && !favEnd) setFavEnd(addMinutesToTime(v, 60));
            }}
            placeholder="16:00"
            className={`${FIELD_CLASS} font-mono`}
          />
        </div>
        <div>
          <label className={LABEL_CLASS}>종료 시간</label>
          <input
            value={favEnd}
            onChange={(e) => setFavEnd(autoFormatTime(e.target.value))}
            placeholder="16:30"
            className={`${FIELD_CLASS} font-mono`}
          />
        </div>
        <button onClick={addFavoriteSlot} className={BUTTON_CLASS}>
          <Bookmark className="w-3.5 h-3.5" />
          <span>즐겨찾기 추가</span>
        </button>
      </div>
    </Modal>
  );
}

function FavoriteGroup({
  label,
  items,
  onRemove,
}: {
  label: string;
  items: SlotFavorite[];
  onRemove: (id: string) => void;
}) {
  return (
    <div className="bg-slate-50 border border-slate-200 rounded-2xl p-4 space-y-3">
      <span className="text-xs font-bold text-slate-700 flex items-center gap-1.5">
        <Star className="w-3.5 h-3.5 text-yellow-400" />
        <span>{label}</span>
      </span>
      <div className="flex flex-wrap gap-2">
        {items.length === 0 && (
          <p className="text-xs text-slate-400">등록된 즐겨찾기가 없습니다.</p>
        )}
        {items.map((f) => (
          <div
            key={f.id}
            className="flex items-center gap-1.5 bg-white border border-slate-200 rounded-xl px-3.5 py-2.5 text-xs font-bold text-slate-700"
          >
            {formatTime(f.start_time)}~{formatTime(f.end_time)}
            <button onClick={() => onRemove(f.id)} className="text-slate-400 hover:text-rose-500">
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
