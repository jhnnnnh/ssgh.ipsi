"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
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
    <div className="login-page">
      <a className="app-skip-link" href="#main-content">본문으로 건너뛰기</a>
      <header className="login-header">
        <span className="app-name">삼성여고 2026 입시</span>
        <button
          type="button"
          onClick={() => setTeacherModalOpen(true)}
          className="ui-button ui-button-outline"
        >
          선생님 로그인
        </button>
      </header>

      <main id="main-content" className="login-content" tabIndex={-1}>
        <div className="login-panel">
          <h1>학생 로그인</h1>
          <p className="login-description">학번, 이름, 비밀번호를 입력해 주세요.</p>

          <div className="login-fields">
            <div className="form-field">
              <label htmlFor="student-id">학번</label>
              <input
                id="student-id"
                type="text"
                inputMode="numeric"
                autoComplete="username"
                value={studentId}
                onChange={(e) => setStudentId(e.target.value)}
                placeholder="예: 30225"
                maxLength={10}
                className="app-input"
              />
            </div>
            <div className="form-field">
              <label htmlFor="student-name">이름</label>
              <input
                id="student-name"
                type="text"
                autoComplete="name"
                value={studentName}
                onChange={(e) => setStudentName(e.target.value)}
                placeholder="예: 홍길동"
                maxLength={10}
                className="app-input"
              />
            </div>
            <div className="form-field">
              <label htmlFor="student-password">비밀번호</label>
              <input
                id="student-password"
                type="password"
                autoComplete="current-password"
                value={studentPw}
                onChange={(e) => setStudentPw(e.target.value)}
                placeholder="비밀번호 입력"
                maxLength={20}
                onKeyDown={(e) => e.key === "Enter" && handleStudentLogin()}
                className="app-input"
              />
              <p className="field-help">처음 로그인하면 입력한 비밀번호가 계정 비밀번호로 설정됩니다.</p>
            </div>

            <button
              type="button"
              onClick={handleStudentLogin}
              disabled={submitting}
              className="ui-button ui-button-primary login-submit"
            >
              {submitting ? "로그인 중…" : "로그인"}
            </button>
          </div>
        </div>
      </main>

      <footer className="login-footer">
        © 2026. jinhyeokapply All rights reserved.
      </footer>

      <Modal
        open={teacherModalOpen}
        onClose={() => setTeacherModalOpen(false)}
        title="선생님 로그인"
        maxWidth="max-w-sm"
        footer={
          <>
            <button
              type="button"
              onClick={() => setTeacherModalOpen(false)}
              className="ui-button ui-button-outline"
            >
              취소
            </button>
            <button
              type="button"
              onClick={handleTeacherLogin}
              disabled={teacherSubmitting}
              className="ui-button ui-button-primary disabled:opacity-60"
            >
              {teacherSubmitting ? "확인 중..." : "로그인"}
            </button>
          </>
        }
      >
        <div className="login-fields">
          <div className="form-field">
            <label htmlFor="teacher-name">이름</label>
            <input
              id="teacher-name"
              type="text"
              autoComplete="username"
              value={teacherName}
              onChange={(e) => setTeacherName(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleTeacherLogin()}
              placeholder="이름 입력"
              className="app-input"
            />
          </div>
          <div className="form-field">
            <label htmlFor="teacher-password">비밀번호</label>
            <input
              id="teacher-password"
              type="password"
              autoComplete="current-password"
              value={teacherPw}
              onChange={(e) => setTeacherPw(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleTeacherLogin()}
              placeholder="비밀번호 입력"
              className="app-input"
            />
          </div>
        </div>
      </Modal>
    </div>
  );
}
