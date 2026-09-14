"use client";

import { useState } from "react";
import { AlertCircle, KeyRound, RefreshCw, Trash2, UserPlus, X } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useToast } from "@/components/providers/ToastProvider";
import { useConfirm } from "@/components/providers/ConfirmProvider";
import { useRoster } from "@/lib/hooks/useRoster";
import { useActiveClass } from "@/components/providers/ActiveClassProvider";
import { AddRosterModal } from "@/components/teacher/AddRosterModal";
import { Card } from "@/components/ui/Card";
import { parseStudentId, parseRosterLine, formatClassLabel } from "@/lib/student-id";

export function RosterTab() {
  const showToast = useToast();
  const confirm = useConfirm();
  const { roster, passwordSetIds, loading, error, reload } = useRoster();
  const { grade, classNo, isAdmin } = useActiveClass();
  const [addModalOpen, setAddModalOpen] = useState(false);
  const [selectMode, setSelectMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [busyId, setBusyId] = useState<string | null>(null);
  const [bulkBusy, setBulkBusy] = useState(false);

  async function handleAddRoster(text: string): Promise<boolean> {
    const lines = text
      .split("\n")
      .map((l) => l.trim())
      .filter(Boolean);

    const rows = lines
      .map((line) => parseRosterLine(line))
      .filter((r): r is { student_id: string; name: string } => r !== null);

    if (rows.length === 0) {
      showToast("학번(5자리)과 이름이 붙어있는 형식으로 한 줄에 한 명씩 입력해 주세요.", "error");
      return false;
    }

    const malformed = rows.filter((r) => !parseStudentId(r.student_id));
    if (malformed.length > 0) {
      showToast(
        `학번 형식이 올바르지 않습니다: ${malformed.map((r) => r.student_id).join(", ")}`,
        "error",
      );
      return false;
    }

    if (!isAdmin) {
      if (grade == null || classNo == null) {
        showToast("담당 반 정보를 확인할 수 없습니다.", "error");
        return false;
      }
      const mismatched = rows.filter((r) => {
        const parsed = parseStudentId(r.student_id)!;
        return parsed.grade !== grade || parsed.classNo !== classNo;
      });
      if (mismatched.length > 0) {
        showToast(
          `본인 담당 반(${formatClassLabel(grade, classNo)}) 학번만 등록할 수 있습니다. (${mismatched
            .map((r) => r.student_id)
            .join(", ")})`,
          "error",
        );
        return false;
      }
    }

    const supabase = createClient();
    const { error } = await supabase.from("roster").insert(rows);
    if (error) {
      const message = error.code === "23505" ? "이미 등록된 학번이 포함되어 있습니다." : "명단 등록에 실패했습니다.";
      showToast(message, "error");
      return false;
    }
    showToast(`${rows.length}명이 등록되었습니다.`, "success");
    reload();
    return true;
  }

  async function handleResetPassword(studentId: string) {
    const ok = await confirm({
      message: `${studentId} 학생의 비밀번호를 초기화하시겠습니까? (다음 로그인 시 새 비밀번호가 설정됩니다)`,
      confirmLabel: "초기화",
      danger: true,
    });
    if (!ok) return;
    setBusyId(studentId);
    const res = await fetch("/api/teacher/reset-student-password", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ studentId }),
    });
    setBusyId(null);
    if (!res.ok) {
      showToast("초기화에 실패했습니다.", "error");
      return;
    }
    showToast("비밀번호가 초기화되었습니다.", "success");
    reload();
  }

  async function handleRemoveStudent(studentId: string) {
    const ok = await confirm({
      message: `${studentId} 학생을 명단에서 삭제하시겠습니까? 계정과 데이터 접근 권한이 함께 제거됩니다.`,
      confirmLabel: "삭제",
      danger: true,
    });
    if (!ok) return;
    setBusyId(studentId);
    const res = await fetch("/api/teacher/remove-student", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ studentId }),
    });
    setBusyId(null);
    if (!res.ok) {
      showToast("삭제에 실패했습니다.", "error");
      return;
    }
    showToast("명단에서 삭제되었습니다.", "success");
    reload();
  }

  function toggleSelectMode() {
    setSelectMode((v) => !v);
    setSelectedIds(new Set());
  }

  function toggleSelectAll() {
    setSelectedIds((prev) =>
      prev.size === roster.length ? new Set() : new Set(roster.map((r) => r.student_id)),
    );
  }

  function toggleSelectOne(studentId: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(studentId)) {
        next.delete(studentId);
      } else {
        next.add(studentId);
      }
      return next;
    });
  }

  async function handleBulkRemove() {
    if (selectedIds.size === 0) {
      showToast("삭제할 학생을 선택해 주세요.", "error");
      return;
    }
    const ok = await confirm({
      message: `선택한 ${selectedIds.size}명을 명단에서 삭제하시겠습니까? 계정과 데이터 접근 권한이 함께 제거됩니다.`,
      confirmLabel: "삭제",
      danger: true,
    });
    if (!ok) return;
    setBulkBusy(true);
    const results = await Promise.all(
      [...selectedIds].map((studentId) =>
        fetch("/api/teacher/remove-student", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ studentId }),
        }),
      ),
    );
    setBulkBusy(false);
    if (results.some((r) => !r.ok)) {
      showToast("일부 학생 삭제에 실패했습니다.", "error");
    } else {
      showToast(`${selectedIds.size}명이 삭제되었습니다.`, "success");
    }
    setSelectMode(false);
    setSelectedIds(new Set());
    reload();
  }

  const allSelected = roster.length > 0 && selectedIds.size === roster.length;

  if (loading) {
    return (
      <Card className="text-center py-12">
        <p className="text-sm text-slate-400">학생 명단을 불러오는 중...</p>
      </Card>
    );
  }

  if (error) {
    return (
      <Card className="text-center py-12 space-y-3">
        <AlertCircle className="w-6 h-6 mx-auto text-rose-500" />
        <p className="text-sm font-bold text-slate-600">{error}</p>
        <button
          type="button"
          onClick={() => void reload()}
          className="mx-auto px-3.5 py-2 bg-white hover:bg-slate-50 text-slate-600 border border-slate-200 rounded-xl text-sm font-bold transition flex items-center gap-1.5"
        >
          <RefreshCw className="w-3.5 h-3.5" />
          다시 불러오기
        </button>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <Card padded={false}>
        <div className="p-6 pb-4 border-b border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <span className="text-xs font-bold bg-indigo-50 text-indigo-700 border border-indigo-200 px-3 py-1 rounded-full">
            총 {roster.length}명 등록됨
          </span>
          <div className="flex items-center gap-2">
            {selectMode ? (
              <>
                <button
                  onClick={toggleSelectAll}
                  className="px-3.5 py-2 bg-white hover:bg-slate-50 text-slate-600 border border-slate-200 rounded-xl text-sm font-bold transition"
                >
                  {allSelected ? "전체 해제" : "전체 선택"}
                </button>
                <button
                  onClick={handleBulkRemove}
                  disabled={bulkBusy}
                  className="px-3.5 py-2 bg-rose-600 hover:bg-rose-700 text-white rounded-xl text-sm font-bold transition flex items-center gap-1.5 disabled:opacity-60"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  <span>선택 삭제 ({selectedIds.size})</span>
                </button>
                <button
                  onClick={toggleSelectMode}
                  className="px-3.5 py-2 text-slate-400 hover:text-slate-600 rounded-xl text-sm font-bold transition flex items-center gap-1"
                >
                  <X className="w-3.5 h-3.5" />
                  <span>취소</span>
                </button>
              </>
            ) : (
              <>
                <button
                  onClick={() => setAddModalOpen(true)}
                  className="px-3.5 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-sm font-bold transition shadow-xs flex items-center gap-1.5"
                >
                  <UserPlus className="w-3.5 h-3.5" />
                  <span>명단 추가</span>
                </button>
                <button
                  onClick={toggleSelectMode}
                  className="px-3.5 py-2 bg-white hover:bg-rose-50 text-rose-600 border border-rose-200 rounded-xl text-sm font-bold transition flex items-center gap-1.5"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  <span>명단 삭제</span>
                </button>
              </>
            )}
          </div>
        </div>

        <div className="overflow-x-auto max-h-96">
          <table className="w-full text-left text-xs text-slate-700">
            <thead className="bg-slate-50 border-b border-slate-200 font-bold text-slate-600 sticky top-0">
              <tr>
                {selectMode && <th className="px-4 py-2.5 w-8"></th>}
                <th className="px-4 py-2.5">번호</th>
                <th className="px-4 py-2.5">학번</th>
                <th className="px-4 py-2.5">이름</th>
                <th className="px-4 py-2.5">비밀번호</th>
                <th className="px-4 py-2.5 text-left">관리</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {roster.map((r, idx) => (
                <tr key={r.student_id}>
                  {selectMode && (
                    <td className="px-4 py-2.5">
                      <input
                        type="checkbox"
                        checked={selectedIds.has(r.student_id)}
                        onChange={() => toggleSelectOne(r.student_id)}
                        className="rounded text-indigo-600 focus:ring-indigo-500"
                      />
                    </td>
                  )}
                  <td className="px-4 py-2.5">{idx + 1}</td>
                  <td className="px-4 py-2.5 font-bold emphasis-title">{r.student_id}</td>
                  <td className="px-4 py-2.5">{r.name}</td>
                  <td className="px-4 py-2.5">
                    {passwordSetIds.has(r.student_id) ? (
                      <span className="text-emerald-600 font-bold">설정됨</span>
                    ) : (
                      <span className="text-slate-400 font-bold">미설정</span>
                    )}
                  </td>
                  <td className="px-4 py-2.5">
                    <div className="flex items-center gap-4">
                      <button
                        onClick={() => handleResetPassword(r.student_id)}
                        disabled={busyId === r.student_id}
                        className="text-slate-400 hover:text-indigo-600 disabled:opacity-40"
                        title="비밀번호 초기화"
                      >
                        <KeyRound className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={() => handleRemoveStudent(r.student_id)}
                        disabled={busyId === r.student_id}
                        className="text-slate-400 hover:text-rose-500 disabled:opacity-40"
                        title="명단에서 삭제"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {roster.length === 0 && (
          <div className="text-center py-8">
            <p className="text-xs font-semibold text-slate-500">등록된 학생 명단이 없습니다.</p>
            <p className="text-[11px] text-slate-400 mt-0.5">
              &ldquo;명단 추가&rdquo; 버튼을 눌러 학생을 등록해 주세요.
            </p>
          </div>
        )}
      </Card>

      <AddRosterModal
        open={addModalOpen}
        onClose={() => setAddModalOpen(false)}
        onSubmit={handleAddRoster}
      />
    </div>
  );
}
