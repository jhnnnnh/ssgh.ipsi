"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  AlertCircle,
  CircleHelp,
  KeyRound,
  LogOut,
  MoreHorizontal,
  ShieldUser,
  RefreshCw,
} from "lucide-react";
import { useAuth } from "@/components/providers/AuthProvider";
import { ActiveClassProvider, useActiveClass } from "@/components/providers/ActiveClassProvider";
import { AppearanceSettingsButtons } from "@/components/settings/AppearanceSettingsButtons";
import { DashboardHeader } from "@/components/ui/DashboardHeader";
import { Card } from "@/components/ui/Card";
import { createClient } from "@/lib/supabase/client";
import { useToast } from "@/components/providers/ToastProvider";
import type { TabItem } from "@/components/ui/Tabs";
import { StatusTab } from "@/components/teacher/StatusTab";
import { WonseoManageTab } from "@/components/teacher/WonseoManageTab";
import { CutoffLookupTab } from "@/components/wonseo/CutoffLookupTab";
import { RosterTab } from "@/components/teacher/RosterTab";
import { TeacherCalendarTab } from "@/components/teacher/TeacherCalendarTab";
import { TeacherManageTab } from "@/components/teacher/TeacherManageTab";
import { AdmissionCutoffUploadTab } from "@/components/teacher/AdmissionCutoffUploadTab";
import { AdmissionOfferingUploadTab } from "@/components/teacher/AdmissionOfferingUploadTab";
import { AdmissionProbabilityTab } from "@/components/teacher/AdmissionProbabilityTab";
import { GradeOverviewTab } from "@/components/teacher/GradeOverviewTab";
import { SchoolResultsUploadTab } from "@/components/teacher/SchoolResultsUploadTab";
import { ChangePasswordModal } from "@/components/teacher/ChangePasswordModal";
import { ManualHelpModal } from "@/components/teacher/ManualHelpModal";
import { formatClassLabel } from "@/lib/student-id";
import { useRoster } from "@/lib/hooks/useRoster";
import { useHashTab } from "@/lib/hooks/useHashTab";

type TeacherTab =
  | "status"
  | "wonseo"
  | "cutoffLookup"
  | "admissionProbability"
  | "roster"
  | "calendar"
  | "gradeOverview"
  | "teachers"
  | "cutoffs";

export default function TeacherPage() {
  const router = useRouter();
  const { session, profile, loading } = useAuth();

  useEffect(() => {
    if (loading) return;
    if (!session || !profile) {
      router.replace("/");
      return;
    }
    if (profile.role !== "teacher") {
      router.replace("/student");
    }
  }, [loading, session, profile, router]);

  if (loading || !profile || profile.role !== "teacher") {
    return (
      <div className="app-loading" role="status" aria-live="polite">
        불러오는 중…
      </div>
    );
  }

  return (
    <ActiveClassProvider>
      <TeacherDashboard />
    </ActiveClassProvider>
  );
}

function TeacherDashboard() {
  const router = useRouter();
  const { profile, refreshProfile, signOut } = useAuth();
  const { grade, classNo, isAdmin, canSwitchClass, classOptions, setActiveClass, loading } =
    useActiveClass();
  const {
    roster,
    loading: rosterLoading,
    error: rosterError,
    reload: reloadRoster,
  } = useRoster();
  const [pwModalOpen, setPwModalOpen] = useState(false);
  const [helpModalOpen, setHelpModalOpen] = useState(false);
  const [togglingAdmin, setTogglingAdmin] = useState(false);
  const showToast = useToast();

  const tabs: TabItem[] = [
    { key: "status", label: "상담관리" },
    { key: "wonseo", label: "수시원서" },
    { key: "cutoffLookup", label: "대입정보" },
    { key: "admissionProbability", label: "합격률계산기" },
    { key: "calendar", label: "입시일정" },
    { key: "roster", label: "학생명단" },
    ...(isAdmin
      ? [
          { key: "gradeOverview", label: "학년 현황" },
          { key: "teachers", label: "교사 계정 관리" },
          { key: "cutoffs", label: "데이터 관리" },
        ]
      : []),
  ];
  const [tab, setTab] = useHashTab<TeacherTab>(
    "status",
    tabs.map((item) => item.key as TeacherTab),
  );
  const headerContext = `${profile?.name ?? ""} 선생님${
    isAdmin
      ? " · 전체관리자"
      : grade != null && classNo != null
        ? ` · ${formatClassLabel(grade, classNo)} 담임`
        : ""
  }`;
  const needsRoster = tab === "wonseo" || tab === "cutoffLookup" || tab === "admissionProbability";

  async function handleToggleAdminMode() {
    if (!profile) return;
    setTogglingAdmin(true);
    const supabase = createClient();
    const { error } = await supabase
      .from("profiles")
      .update({ admin_mode_enabled: !profile.admin_mode_enabled })
      .eq("id", profile.id);
    setTogglingAdmin(false);
    if (error) {
      showToast("관리자 모드 전환에 실패했습니다.", "error");
      return;
    }
    await refreshProfile();
  }

  async function handleSignOut() {
    await signOut();
    router.replace("/");
  }

  function closeToolsMenu(target: HTMLElement) {
    target.closest("details")?.removeAttribute("open");
  }

  return (
    <div className="dashboard-page">
      <a className="app-skip-link" href="#app-tab-panel">본문으로 건너뛰기</a>
      <DashboardHeader
        context={headerContext}
        items={tabs}
        active={tab}
        onChange={(key) => setTab(key as TeacherTab)}
        actions={
          <>
            {canSwitchClass && (
              <select
                aria-label="관리할 학급 선택"
                value={grade != null && classNo != null ? `${grade}-${classNo}` : ""}
                onChange={(e) => {
                  const [g, c] = e.target.value.split("-").map(Number);
                  setActiveClass(g, c);
                }}
                className="header-select"
              >
                {classOptions.length === 0 && <option value="">등록된 반 없음</option>}
                {classOptions.map((c) => (
                  <option key={`${c.grade}-${c.classNo}`} value={`${c.grade}-${c.classNo}`}>
                    {c.label}
                  </option>
                ))}
              </select>
            )}
            <AppearanceSettingsButtons className="header-icon-action" />
            <div className="teacher-header-desktop-tools">
              {profile?.dual_admin && (
                <button
                  onClick={handleToggleAdminMode}
                  disabled={togglingAdmin}
                  type="button"
                  title={`관리자 모드 ${profile.admin_mode_enabled ? "켜짐" : "꺼짐"}`}
                  aria-label={`관리자 모드 ${profile.admin_mode_enabled ? "켜짐" : "꺼짐"}`}
                  className={`header-icon-action disabled:opacity-60 ${
                    profile.admin_mode_enabled ? "is-active" : ""
                  }`}
                >
                  <ShieldUser className="w-4 h-4" aria-hidden="true" />
                </button>
              )}
              <button
                onClick={() => setHelpModalOpen(true)}
                type="button"
                aria-label="사용 매뉴얼"
                title="사용 매뉴얼"
                className="header-icon-action"
              >
                <CircleHelp className="w-4 h-4" aria-hidden="true" />
              </button>
              <button
                onClick={() => setPwModalOpen(true)}
                type="button"
                aria-label="비밀번호 변경"
                title="비밀번호 변경"
                className="header-icon-action"
              >
                <KeyRound className="w-4 h-4" aria-hidden="true" />
              </button>
              <button
                onClick={handleSignOut}
                type="button"
                aria-label="로그아웃"
                title="나가기"
                className="header-icon-action is-danger"
              >
                <LogOut className="w-4 h-4" aria-hidden="true" />
              </button>
            </div>
            <details
              className="teacher-header-mobile-tools"
              onKeyDown={(event) => {
                if (event.key === "Escape") {
                  closeToolsMenu(event.currentTarget);
                  event.currentTarget.querySelector("summary")?.focus();
                }
              }}
            >
              <summary className="header-icon-action" aria-label="교사 도구 더 보기">
                <MoreHorizontal className="w-5 h-5" aria-hidden="true" />
              </summary>
              <div className="header-more-popover" aria-label="교사 도구">
                {profile?.dual_admin && (
                  <button
                    type="button"
                    disabled={togglingAdmin}
                    onClick={(event) => {
                      closeToolsMenu(event.currentTarget);
                      void handleToggleAdminMode();
                    }}
                  >
                    <ShieldUser className="w-4 h-4" aria-hidden="true" />
                    관리자 모드 {profile.admin_mode_enabled ? "끄기" : "켜기"}
                  </button>
                )}
                <button
                  type="button"
                  onClick={(event) => {
                    closeToolsMenu(event.currentTarget);
                    setHelpModalOpen(true);
                  }}
                >
                  <CircleHelp className="w-4 h-4" aria-hidden="true" />
                  사용 매뉴얼
                </button>
                <button
                  type="button"
                  onClick={(event) => {
                    closeToolsMenu(event.currentTarget);
                    setPwModalOpen(true);
                  }}
                >
                  <KeyRound className="w-4 h-4" aria-hidden="true" />
                  비밀번호 변경
                </button>
                <button
                  type="button"
                  onClick={(event) => {
                    closeToolsMenu(event.currentTarget);
                    void handleSignOut();
                  }}
                  className="is-danger"
                >
                  <LogOut className="w-4 h-4" aria-hidden="true" />
                  로그아웃
                </button>
              </div>
            </details>
          </>
        }
      />

      <div className="app-content">
        <main
          id="app-tab-panel"
          className="min-w-0"
          role="tabpanel"
          aria-labelledby={`app-tab-${tab}`}
          tabIndex={-1}
        >
          {!loading &&
          grade == null &&
          classNo == null &&
          tab !== "teachers" &&
          tab !== "cutoffs" &&
          tab !== "cutoffLookup" &&
          tab !== "admissionProbability" ? (
            <Card padded={false} className="p-12 text-center space-y-2">
              <p className="text-sm font-bold text-slate-600">
                {isAdmin ? "아직 등록된 반이 없습니다." : "담당 반 정보를 확인할 수 없습니다."}
              </p>
              {isAdmin && (
                <p className="text-xs text-slate-400">
                  &ldquo;교사 계정 관리&rdquo;에서 담임교사를 먼저 등록하거나, 학생 명단이 있는 반을 만들어 주세요.
                </p>
              )}
            </Card>
          ) : needsRoster && rosterLoading ? (
            <Card padded={false} className="p-12 text-center">
              <p className="text-sm text-slate-400">학생 명단을 불러오는 중...</p>
            </Card>
          ) : needsRoster && rosterError ? (
            <Card padded={false} className="p-12 text-center space-y-3">
              <AlertCircle className="w-6 h-6 mx-auto text-rose-500" aria-hidden="true" />
              <p className="text-sm font-bold text-slate-600">{rosterError}</p>
              <button
                type="button"
                onClick={() => void reloadRoster()}
                className="mx-auto px-3.5 py-2 bg-white hover:bg-slate-50 text-slate-600 border border-slate-200 rounded-xl text-sm font-bold transition flex items-center gap-1.5"
              >
                <RefreshCw className="w-3.5 h-3.5" aria-hidden="true" />
                다시 불러오기
              </button>
            </Card>
          ) : (
            <>
              {tab === "status" && <StatusTab />}
              {tab === "wonseo" && <WonseoManageTab roster={roster} />}
              {tab === "cutoffLookup" && <CutoffLookupTab roster={roster} />}
              {tab === "admissionProbability" && <AdmissionProbabilityTab roster={roster} />}
              {tab === "roster" && <RosterTab />}
              {tab === "calendar" && <TeacherCalendarTab />}
            </>
          )}
          {tab === "gradeOverview" && isAdmin && <GradeOverviewTab />}
          {tab === "teachers" && isAdmin && <TeacherManageTab />}
          {tab === "cutoffs" && isAdmin && (
            <div className="grid grid-cols-1 xl:grid-cols-2 gap-5 items-start">
              <AdmissionCutoffUploadTab />
              <AdmissionOfferingUploadTab />
              <SchoolResultsUploadTab />
            </div>
          )}
        </main>

        <footer className="app-footer">
          <p>© 2026. jinhyeokapply All rights reserved.</p>
        </footer>
      </div>

      <ChangePasswordModal open={pwModalOpen} onClose={() => setPwModalOpen(false)} />
      <ManualHelpModal open={helpModalOpen} onClose={() => setHelpModalOpen(false)} />
    </div>
  );
}
