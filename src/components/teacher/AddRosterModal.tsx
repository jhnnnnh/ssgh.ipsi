"use client";

import { useState } from "react";
import { UserPlus } from "lucide-react";
import { Modal } from "@/components/ui/Modal";

export function AddRosterModal({
  open,
  onClose,
  onSubmit,
}: {
  open: boolean;
  onClose: () => void;
  onSubmit: (text: string) => Promise<boolean>;
}) {
  const [pasteText, setPasteText] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit() {
    setSubmitting(true);
    const ok = await onSubmit(pasteText);
    setSubmitting(false);
    if (ok) {
      setPasteText("");
      onClose();
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="학생 명단 추가"
      icon={<UserPlus className="w-4 h-4 text-indigo-600" />}
      maxWidth="max-w-lg"
      footer={
        <>
          <button
            onClick={onClose}
            className="px-4 py-2 border border-slate-200 text-slate-600 rounded-xl text-xs font-bold hover:bg-slate-50 transition"
          >
            취소
          </button>
          <button
            onClick={handleSubmit}
            disabled={submitting}
            className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold transition shadow-xs disabled:opacity-60"
          >
            {submitting ? "등록 중..." : "등록하기"}
          </button>
        </>
      }
    >
      <div>
        <textarea
          value={pasteText}
          onChange={(e) => setPasteText(e.target.value)}
          rows={6}
          placeholder={"학번 이름\n학번 이름\n학번 이름"}
          className="w-full bg-slate-50 border border-slate-300 rounded-xl p-3.5 text-xs font-mono text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-y"
        />
        <p className="text-xs text-slate-400 mt-2">
          * 명단에 등록된 학생만 학생 모드 로그인이 허용되며 최초 로그인 시 비밀번호가
          지정됩니다.
        </p>
      </div>
    </Modal>
  );
}
