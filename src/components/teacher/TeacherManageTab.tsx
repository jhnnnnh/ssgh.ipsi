"use client";

import { useEffect, useMemo, useState } from "react";
import { Pencil, ShieldUser, Trash2, UserCog, UserPlus } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useToast } from "@/components/providers/ToastProvider";
import { useConfirm } from "@/components/providers/ConfirmProvider";
import { Modal } from "@/components/ui/Modal";
import { cn } from "@/lib/cn";
import { formatClassLabel } from "@/lib/student-id";
import { useAuth } from "@/components/providers/AuthProvider";
import type { Profile, TeacherRole } from "@/lib/database.types";

function useTeachers() {
  const [teachers, setTeachers] = useState<Profile[]>([]);
  const [loading, setLoading] = useState(true);

  const reload = async () => {
    const supabase = createClient();
    const { data } = await supabase
      .from("profiles")
      .select("*")
      .eq("role", "teacher")
      .order("name", { ascending: true });
    setTeachers(data ?? []);
    setLoading(false);
  };

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    reload();
  }, []);

  const sorted = useMemo(
    () =>
      [...teachers].sort((a, b) => {
        // 담당 반 없음(전체관리자)은 맨 앞, 나머지는 학년/반 순
        if (a.grade == null && b.grade == null) return 0;
        if (a.grade == null) return -1;
        if (b.grade == null) return 1;
        return a.grade - b.grade || (a.class_no ?? 0) - (b.class_no ?? 0);
      }),
    [teachers],
  );

  return { teachers: sorted, loading, reload };
}

type TeacherFormState = {
  name: string;
  password: string;
  teacherRole: TeacherRole;
  grade: string;
  classNo: string;
};

const EMPTY_FORM: TeacherFormState = {
  name: "",
  password: "",
  teacherRole: "homeroom",
  grade: "",
  classNo: "",
};

export function TeacherManageTab() {
  const showToast = useToast();
  const confirm = useConfirm();
  const { profile: myProfile } = useAuth();
  const { teachers, reload } = useTeachers();
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Profile | null>(null);
  const [form, setForm] = useState<TeacherFormState>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);

  function openCreate() {
    setEditing(null);
    setForm(EMPTY_FORM);
    setModalOpen(true);
  }
  function openEdit(teacher: Profile) {
    setEditing(teacher);
    setForm({
      name: teacher.name ?? "",
      password: "",
      teacherRole: teacher.teacher_role ?? "homeroom",
      grade: teacher.grade != null ? String(teacher.grade) : "",
      classNo: teacher.class_no != null ? String(teacher.class_no) : "",
    });
    setModalOpen(true);
  }

  function set<K extends keyof TeacherFormState>(key: K, value: TeacherFormState[K]) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  async function handleDelete(teacher: Profile) {
    const ok = await confirm({
      message: `${teacher.name} 교사 계정을 삭제하시겠습니까? 되돌릴 수 없습니다.`,
      confirmLabel: "삭제",
      danger: true,
    });
    if (!ok) return;
    setBusyId(teacher.id);
    const res = await fetch("/api/admin/delete-teacher", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ teacherId: teacher.id }),
    });
    const data = await res.json();
    setBusyId(null);
    if (!res.ok) {
      showToast(data.error ?? "삭제에 실패했습니다.", "error");
      return;
    }
    showToast("교사 계정이 삭제되었습니다.", "success");
    reload();
  }

  async function handleSave() {
    if (form.teacherRole === "homeroom" && (!form.grade || !form.classNo)) {
      showToast("담당 반(학년/반)을 입력해 주세요.", "error");
      return;
    }
    if (editing && form.password && form.password.length < 6) {
      showToast("새 비밀번호는 6자 이상이어야 합니다.", "error");
      return;
    }
    setSaving(true);

    if (editing) {
      const res = await fetch("/api/admin/update-teacher", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          teacherId: editing.id,
          teacherRole: form.teacherRole,
          grade: form.teacherRole === "homeroom" ? Number(form.grade) : null,
          classNo: form.teacherRole === "homeroom" ? Number(form.classNo) : null,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setSaving(false);
        showToast(data.error ?? "수정에 실패했습니다.", "error");
        return;
      }
      if (form.password) {
        const pwRes = await fetch("/api/admin/reset-teacher-password", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ teacherId: editing.id, newPassword: form.password }),
        });
        const pwData = await pwRes.json();
        setSaving(false);
        if (!pwRes.ok) {
          showToast(pwData.error ?? "비밀번호 변경에 실패했습니다.", "error");
          return;
        }
      } else {
        setSaving(false);
      }
      showToast("교사 정보가 수정되었습니다.", "success");
    } else {
      if (!form.name.trim()) {
        setSaving(false);
        showToast("이름을 입력해 주세요.", "error");
        return;
      }
      if (form.password.length < 6) {
        setSaving(false);
        showToast("초기 비밀번호는 6자 이상이어야 합니다.", "error");
        return;
      }
      const res = await fetch("/api/admin/create-teacher", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: form.name.trim(),
          password: form.password,
          teacherRole: form.teacherRole,
          grade: form.teacherRole === "homeroom" ? Number(form.grade) : null,
          classNo: form.teacherRole === "homeroom" ? Number(form.classNo) : null,
        }),
      });
      const data = await res.json();
      setSaving(false);
      if (!res.ok) {
        showToast(data.error ?? "계정 생성에 실패했습니다.", "error");
        return;
      }
      showToast("교사 계정이 생성되었습니다.", "success");
    }

    setModalOpen(false);
    reload();
  }

  return (
    <div className="space-y-6">
      <div className="bg-white rounded-3xl border border-slate-200/80 shadow-sm overflow-hidden">
        <div className="p-5 border-b border-slate-100 flex items-center justify-between">
          <h3 className="font-bold text-slate-800 text-sm flex items-center gap-2">
            <UserCog className="w-4 h-4 text-indigo-600" />
            <span>교사 계정 관리</span>
          </h3>
          <button
            onClick={openCreate}
            className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold transition shadow-xs flex items-center gap-1.5"
          >
            <UserPlus className="w-3.5 h-3.5" />
            <span>새 교사 계정 추가</span>
          </button>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs text-slate-700">
            <thead className="bg-slate-50 border-b border-slate-200 font-bold text-slate-600">
              <tr>
                <th className="px-5 py-2.5">이름</th>
                <th className="px-5 py-2.5">역할</th>
                <th className="px-5 py-2.5">담당 반</th>
                <th className="px-5 py-2.5 text-left">관리</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {teachers.map((t) => (
                <tr key={t.id}>
                  <td className="px-5 py-3 font-bold">{t.name}</td>
                  <td className="px-5 py-3">
                    <span
                      className={cn(
                        "text-xs font-bold px-2.5 py-1 rounded-full border",
                        t.teacher_role === "admin"
                          ? "bg-indigo-50 text-indigo-700 border-indigo-200"
                          : "bg-amber-50 text-amber-700 border-amber-200",
                      )}
                    >
                      {t.teacher_role === "admin" ? "전체관리자" : "담임교사"}
                    </span>
                  </td>
                  <td className="px-5 py-3">
                    {t.grade != null && t.class_no != null
                      ? formatClassLabel(t.grade, t.class_no)
                      : "해당 없음"}
                  </td>
                  <td className="px-5 py-3">
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => openEdit(t)}
                        className="text-slate-400 hover:text-indigo-600"
                        title="수정"
                      >
                        <Pencil className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={() => handleDelete(t)}
                        disabled={busyId === t.id || t.id === myProfile?.id}
                        className="text-slate-400 hover:text-rose-500 disabled:opacity-30 disabled:cursor-not-allowed"
                        title={t.id === myProfile?.id ? "본인 계정은 삭제할 수 없습니다" : "삭제"}
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

        {teachers.length === 0 && (
          <div className="text-center py-10">
            <p className="text-xs font-semibold text-slate-500">등록된 교사 계정이 없습니다.</p>
          </div>
        )}
      </div>

      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title={editing ? "교사 정보 수정" : "새 교사 계정 추가"}
        icon={<ShieldUser className="w-4 h-4 text-indigo-600" />}
        maxWidth="max-w-sm"
        footer={
          <>
            <button
              onClick={() => setModalOpen(false)}
              className="px-4 py-2 border border-slate-200 text-slate-600 rounded-xl text-xs font-bold hover:bg-slate-50 transition"
            >
              취소
            </button>
            <button
              onClick={handleSave}
              disabled={saving}
              className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold transition shadow-xs disabled:opacity-60"
            >
              {saving ? "저장 중..." : "저장하기"}
            </button>
          </>
        }
      >
        {!editing && (
          <div>
            <label className="block font-bold text-slate-700 mb-1">이름</label>
            <input
              value={form.name}
              onChange={(e) => set("name", e.target.value)}
              placeholder="예: 홍길동"
              className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3 py-2.5 font-semibold text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>
        )}
        {!editing && (
          <div>
            <label className="block font-bold text-slate-700 mb-1">초기 비밀번호</label>
            <input
              type="password"
              value={form.password}
              onChange={(e) => set("password", e.target.value)}
              placeholder="6자 이상"
              className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3 py-2.5 text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>
        )}
        {editing && (
          <div>
            <label className="block font-bold text-slate-700 mb-1">
              비밀번호 변경 <span className="text-slate-400 font-normal">(선택)</span>
            </label>
            <input
              type="password"
              value={form.password}
              onChange={(e) => set("password", e.target.value)}
              placeholder="바꾸지 않으려면 비워두세요"
              className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3 py-2.5 text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>
        )}
        <div>
          <label className="block font-bold text-slate-700 mb-1">역할</label>
          <div className="grid grid-cols-2 gap-1.5">
            <button
              type="button"
              onClick={() => set("teacherRole", "homeroom")}
              className={cn(
                "py-2 rounded-xl border font-bold transition",
                form.teacherRole === "homeroom"
                  ? "bg-indigo-600 text-white border-indigo-600"
                  : "bg-white text-slate-600 border-slate-200 hover:bg-slate-50",
              )}
            >
              담임교사
            </button>
            <button
              type="button"
              onClick={() => set("teacherRole", "admin")}
              className={cn(
                "py-2 rounded-xl border font-bold transition",
                form.teacherRole === "admin"
                  ? "bg-indigo-600 text-white border-indigo-600"
                  : "bg-white text-slate-600 border-slate-200 hover:bg-slate-50",
              )}
            >
              전체관리자
            </button>
          </div>
        </div>
        {form.teacherRole === "homeroom" && (
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block font-bold text-slate-700 mb-1">학년</label>
              <input
                type="number"
                min={1}
                max={9}
                value={form.grade}
                onChange={(e) => set("grade", e.target.value)}
                placeholder="예: 3"
                className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3 py-2.5 font-semibold text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>
            <div>
              <label className="block font-bold text-slate-700 mb-1">반</label>
              <input
                type="number"
                min={1}
                max={9}
                value={form.classNo}
                onChange={(e) => set("classNo", e.target.value)}
                placeholder="예: 2"
                className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3 py-2.5 font-semibold text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
