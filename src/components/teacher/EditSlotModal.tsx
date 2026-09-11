"use client";

import { useEffect, useState } from "react";
import { PencilLine } from "lucide-react";
import { Modal } from "@/components/ui/Modal";
import { createClient } from "@/lib/supabase/client";
import { useToast } from "@/components/providers/ToastProvider";
import { useConfirm } from "@/components/providers/ConfirmProvider";
import { autoFormatTime, isValidTime } from "@/lib/time";
import type { CounselingSlot } from "@/lib/database.types";

export function EditSlotModal({
  slot,
  onClose,
  onSaved,
}: {
  slot: CounselingSlot | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const showToast = useToast();
  const confirm = useConfirm();
  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");
  const [studentId, setStudentId] = useState("");
  const [studentName, setStudentName] = useState("");
  const [memo, setMemo] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (slot) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setStart(slot.start_time ? slot.start_time.slice(0, 5) : "");
      setEnd(slot.end_time ? slot.end_time.slice(0, 5) : "");
      setStudentId(slot.student_id ?? "");
      setStudentName(slot.student_name ?? "");
      setMemo(slot.memo ?? "");
    }
  }, [slot]);

  if (!slot) return null;
  const isLabelSlot = slot.label != null;

  async function saveSlot(studentIdValue: string, studentNameValue: string) {
    if (!isLabelSlot && (!isValidTime(start) || !isValidTime(end) || start >= end)) {
      showToast("올바른 시간 형식(HH:MM), 종료 > 시작을 확인해 주세요.", "error");
      return false;
    }
    setSaving(true);
    const trimmedId = studentIdValue.trim();
    const trimmedName = studentNameValue.trim();
    const willBeBooked = Boolean(trimmedId && trimmedName);
    const supabase = createClient();
    const { error } = await supabase
      .from("counseling_slots")
      .update({
        ...(isLabelSlot ? {} : { start_time: start, end_time: end }),
        is_booked: willBeBooked,
        student_id: willBeBooked ? trimmedId : null,
        student_name: willBeBooked ? trimmedName : null,
        booked_at: willBeBooked ? (slot!.booked_at ?? new Date().toISOString()) : null,
        memo: memo.trim() || null,
      })
      .eq("id", slot!.id);
    setSaving(false);
    if (error) {
      showToast("저장에 실패했습니다.", "error");
      return false;
    }
    return true;
  }

  async function handleSave() {
    const ok = await saveSlot(studentId, studentName);
    if (!ok) return;
    showToast("슬롯 정보가 수정되었습니다.", "success");
    onSaved();
    onClose();
  }

  async function handleCancelReservation() {
    const ok = await confirm({
      message: "이 슬롯의 예약을 취소하시겠습니까?",
      confirmLabel: "예약 취소",
      danger: true,
    });
    if (!ok) return;
    setStudentId("");
    setStudentName("");
    const saved = await saveSlot("", "");
    if (!saved) return;
    showToast("예약이 취소되었습니다.", "success");
    onSaved();
  }

  return (
    <Modal
      open={!!slot}
      onClose={onClose}
      title="상담 슬롯 정보 수정"
      icon={<PencilLine className="w-4 h-4 text-indigo-600" />}
      maxWidth="max-w-md"
      footer={
        <>
          <button
            onClick={onClose}
            className="px-4 py-2 border border-slate-200 text-slate-600 rounded-xl text-xs font-bold hover:bg-slate-50 transition"
          >
            취소
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold transition shadow-xs disabled:opacity-60"
          >
            저장하기
          </button>
        </>
      }
    >
      {isLabelSlot ? (
        <div>
          <label className="block text-xs font-bold text-slate-600 mb-1">이름</label>
          <p className="bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-sm font-bold text-slate-800">
            {slot.label}
          </p>
          <p className="text-[11px] text-slate-400 mt-1">정해진 시각이 없는 예비 슬롯이라 이름은 바꿀 수 없어요.</p>
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className="block text-xs font-bold text-slate-600 mb-1">시작 시간</label>
            <input
              value={start}
              onChange={(e) => setStart(autoFormatTime(e.target.value))}
              className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3 py-2 text-xs font-mono text-slate-800"
            />
          </div>
          <div>
            <label className="block text-xs font-bold text-slate-600 mb-1">종료 시간</label>
            <input
              value={end}
              onChange={(e) => setEnd(autoFormatTime(e.target.value))}
              className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3 py-2 text-xs font-mono text-slate-800"
            />
          </div>
        </div>
      )}

      <div className="border-t border-slate-100 pt-3">
        <div className="flex items-center justify-between mb-2">
          <label className="block text-xs font-bold text-slate-700">예약 학생 정보</label>
          {slot.is_booked && (
            <button
              onClick={handleCancelReservation}
              disabled={saving}
              className="text-[11px] font-bold text-rose-600 hover:underline disabled:opacity-50"
            >
              예약 취소
            </button>
          )}
        </div>
        <div className="grid grid-cols-2 gap-2">
          <input
            value={studentId}
            onChange={(e) => setStudentId(e.target.value)}
            placeholder="학번"
            className="bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs font-semibold text-slate-800"
          />
          <input
            value={studentName}
            onChange={(e) => setStudentName(e.target.value)}
            placeholder="이름"
            className="bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs font-semibold text-slate-800"
          />
        </div>
        <p className="text-[11px] text-slate-400 mt-1.5">
          학번과 이름을 모두 입력하면 예약으로 등록되고, 비워두면 예약이 해제됩니다.
        </p>
      </div>

      <div className="border-t border-slate-100 pt-3">
        <label className="block text-xs font-bold text-slate-700 mb-1">메모</label>
        <textarea
          value={memo}
          onChange={(e) => setMemo(e.target.value)}
          rows={2}
          placeholder="이 상담/예약에 대한 메모를 남겨보세요."
          className="w-full bg-slate-50 border border-slate-300 rounded-xl p-2.5 text-xs text-slate-800 resize-y"
        />
      </div>
    </Modal>
  );
}
