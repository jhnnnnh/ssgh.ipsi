"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { IdCard, KeyRound, LogIn, ShieldUser, User } from "lucide-react";
import { useAuth } from "@/components/providers/AuthProvider";
import { useToast } from "@/components/providers/ToastProvider";
import { createClient } from "@/lib/supabase/client";
import { Modal } from "@/components/ui/Modal";

export default function HomePage() {
  const router = useRouter();
  const showToast = useToast();
  const { session, profile, loading } = useAuth();

  const [studentId, setStudentId] = useState("");
  const [studentName, setStudentName] = useState("");
  const [studentPw, setStudentPw] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const [teacherModalOpen, setTeacherModalOpen] = useState(false);
  const [teacherName, setTeacherName] = useState("");
  const [teacherPw, setTeacherPw] = useState("");
  const [teacherSubmitting, setTeacherSubmitting] = useState(false);

  useEffect(() => {
    if (loading || !session || !profile) return;
    router.replace(profile.role === "teacher" ? "/teacher" : "/student");
  }, [loading, session, profile, router]);

  async function handleStudentLogin() {
    if (!studentId.trim() || !studentName.trim() || !studentPw) {
      showToast("학번, 이름, 비밀번호를 모두 입력해 주세요.", "error");
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch("/api/auth/student-login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          studentId: studentId.trim(),
          name: studentName.trim(),
          password: studentPw,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        showToast(data.error ?? "로그인에 실패했습니다.", "error");
        return;
      }
      const supabase = createClient();
      await supabase.auth.setSession(data.session);
      showToast("로그인되었습니다.", "success");
      router.push("/student");
    } catch {
      showToast("네트워크 오류가 발생했습니다.", "error");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleTeacherLogin() {
    if (!teacherName.trim() || !teacherPw) {
      showToast("이름과 비밀번호를 입력해 주세요.", "error");
      return;
    }
    setTeacherSubmitting(true);
    try {
      const res = await fetch("/api/auth/teacher-login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: teacherName.trim(), password: teacherPw }),
      });
      const data = await res.json();
      if (!res.ok) {
        showToast(data.error ?? "인증에 실패했습니다.", "error");
        return;
      }
      const supabase = createClient();
      await supabase.auth.setSession(data.session);
      setTeacherModalOpen(false);
      setTeacherName("");
      setTeacherPw("");
      router.push("/teacher");
    } catch {
      showToast("네트워크 오류가 발생했습니다.", "error");
    } finally {
      setTeacherSubmitting(false);
    }
  }

  return (
    <div className="max-w-7xl mx-auto w-full px-4 sm:px-6 lg:px-8 py-6 sm:py-10 flex-1 flex flex-col">
      <main id="main-content" className="bg-white rounded-3xl p-5 sm:p-8 w-full max-w-md mx-auto my-auto border border-slate-200 space-y-6">
        <div className="flex justify-end">
          <button
            onClick={() => setTeacherModalOpen(true)}
            className="text-xs font-bold text-slate-400 hover:text-indigo-600 transition flex items-center gap-1"
          >
            <ShieldUser className="w-3 h-3" />
            <span>선생님 모드</span>
          </button>
        </div>
        <div className="text-center max-w-md mx-auto space-y-2 -mt-2">
          <div className="w-12 h-12 bg-indigo-50 text-indigo-600 rounded-2xl flex items-center justify-center mx-auto text-xl font-bold mb-3">
            <LogIn className="w-5 h-5" />
          </div>
          <h2 className="text-2xl sm:text-3xl font-black text-slate-900 tracking-tight">로그인</h2>
          <p className="text-sm text-slate-600 leading-relaxed">
            학번과 이름, 비밀번호를 입력하여 로그인하세요.
            <br />
            <span className="text-slate-500 text-xs">
              * 최초 로그인 시 입력한 비밀번호가 내 비밀번호로 설정됩니다.
            </span>
          </p>
        </div>

        <div className="max-w-md mx-auto space-y-4 pt-2">
          <div>
            <label className="block text-sm font-bold text-slate-700 mb-1 flex items-center gap-1.5">
              <IdCard className="w-3.5 h-3.5 text-indigo-500" />
              <span>학번</span>
            </label>
            <input
              value={studentId}
              onChange={(e) => setStudentId(e.target.value)}
              placeholder="예: 30225"
              maxLength={10}
              className="w-full bg-white border border-slate-300 rounded-xl px-4 py-3 text-base font-semibold text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-colors"
            />
          </div>
          <div>
            <label className="block text-sm font-bold text-slate-700 mb-1 flex items-center gap-1.5">
              <User className="w-3.5 h-3.5 text-indigo-500" />
              <span>이름</span>
            </label>
            <input
              value={studentName}
              onChange={(e) => setStudentName(e.target.value)}
              placeholder="예: 홍길동"
              maxLength={10}
              className="w-full bg-white border border-slate-300 rounded-xl px-4 py-3 text-base font-semibold text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-colors"
            />
          </div>
          <div>
            <label className="block text-sm font-bold text-slate-700 mb-1 flex items-center gap-1.5">
              <KeyRound className="w-3.5 h-3.5 text-indigo-500" />
              <span>비밀번호</span>
            </label>
            <input
              type="password"
              value={studentPw}
              onChange={(e) => setStudentPw(e.target.value)}
              placeholder="비밀번호 입력"
              maxLength={20}
              onKeyDown={(e) => e.key === "Enter" && handleStudentLogin()}
              className="w-full bg-white border border-slate-300 rounded-xl px-4 py-3 text-base text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-colors"
            />
          </div>

          <button
            onClick={handleStudentLogin}
            disabled={submitting}
            className="w-full min-h-11 py-3 bg-indigo-600 hover:bg-indigo-700 active:scale-[0.99] text-white rounded-xl text-sm font-bold transition-colors flex items-center justify-center gap-2 mt-2 disabled:opacity-60"
          >
            <LogIn className="w-3.5 h-3.5" />
            <span>{submitting ? "로그인 중..." : "로그인"}</span>
          </button>
        </div>
      </main>

      <footer className="mt-12 text-center text-xs text-slate-400 pb-6 border-t border-slate-200/60 pt-6">
        <p>© 2026. jinhyeokapply All rights reserved.</p>
      </footer>

      <Modal
        open={teacherModalOpen}
        onClose={() => setTeacherModalOpen(false)}
        title="선생님 로그인"
        icon={<KeyRound className="w-4 h-4 text-indigo-600" />}
        maxWidth="max-w-sm"
        footer={
          <>
            <button
              onClick={() => setTeacherModalOpen(false)}
              className="px-4 py-2 border border-slate-200 text-slate-600 rounded-xl text-xs font-bold hover:bg-slate-50 transition"
            >
              취소
            </button>
            <button
              onClick={handleTeacherLogin}
              disabled={teacherSubmitting}
              className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold transition shadow-xs disabled:opacity-60"
            >
              {teacherSubmitting ? "확인 중..." : "로그인"}
            </button>
          </>
        }
      >
        <div className="space-y-3">
          <div>
            <label className="block text-xs font-bold text-slate-600 mb-1.5">이름</label>
            <input
              value={teacherName}
              onChange={(e) => setTeacherName(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleTeacherLogin()}
              placeholder="이름 입력"
              className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3.5 py-2.5 text-xs text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>
          <div>
            <label className="block text-xs font-bold text-slate-600 mb-1.5">
              비밀번호 입력
            </label>
            <input
              type="password"
              value={teacherPw}
              onChange={(e) => setTeacherPw(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleTeacherLogin()}
              placeholder="비밀번호 입력"
              className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3.5 py-2.5 text-xs text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>
        </div>
      </Modal>
    </div>
  );
}
