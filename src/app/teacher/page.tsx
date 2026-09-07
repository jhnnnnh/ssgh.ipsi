"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  CalendarDays,
  CircleHelp,
  Contact,
  Database,
  GraduationCap,
  KeyRound,
  ListChecks,
  LogOut,
  Search,
  ShieldUser,
  UsersRound,
  UserCog,
} from "lucide-react";
import { useAuth } from "@/components/providers/AuthProvider";
import { ActiveClassProvider, useActiveClass } from "@/components/providers/ActiveClassProvider";
import { AppearanceSettingsButtons } from "@/components/settings/AppearanceSettingsButtons";
import { DashboardHeader } from "@/components/ui/DashboardHeader";
import { Card } from "@/components/ui/Card";
import { createClient } from "@/lib/supabase/client";
import { useToast } from "@/components/providers/ToastProvider";
import { Tabs } from "@/components/ui/Tabs";
import { StatusTab } from "@/components/teacher/StatusTab";
import { WonseoManageTab } from "@/components/teacher/WonseoManageTab";
import { CutoffLookupTab } from "@/components/wonseo/CutoffLookupTab";
import { RosterTab } from "@/components/teacher/RosterTab";
import { TeacherCalendarTab } from "@/components/teacher/TeacherCalendarTab";
import { TeacherManageTab } from "@/components/teacher/TeacherManageTab";
import { AdmissionCutoffUploadTab } from "@/components/teacher/AdmissionCutoffUploadTab";
import { AdmissionOfferingUploadTab } from "@/components/teacher/AdmissionOfferingUploadTab";
import { ChangePasswordModal } from "@/components/teacher/ChangePasswordModal";
import { ManualHelpModal } from "@/components/teacher/ManualHelpModal";
import { formatClassLabel } from "@/lib/student-id";
import { useRoster } from "@/lib/hooks/useRoster";

type TeacherTab = "status" | "wonseo" | "cutoffLookup" | "roster" | "calendar" | "teachers" | "cutoffs";

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
      <div className="max-w-5xl mx-auto w-full px-4 py-10 flex-1 flex items-center justify-center">
        <p className="text-sm text-slate-400">불러오는 중...</p>
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
  const { roster } = useRoster();
  const [tab, setTab] = useState<TeacherTab>("status");
  const [pwModalOpen, setPwModalOpen] = useState(false);
  const [helpModalOpen, setHelpModalOpen] = useState(false);
  const [togglingAdmin, setTogglingAdmin] = useState(false);
  const showToast = useToast();

  const tabs = [
    { key: "status", label: "상담 신청 현황", icon: <ListChecks className="w-4 h-4" /> },
    { key: "wonseo", label: "수시 원서 관리", icon: <GraduationCap className="w-4 h-4" /> },
    { key: "cutoffLookup", label: "대입 정보 조회", icon: <Search className="w-4 h-4" /> },
    { key: "calendar", label: "입시 일정", icon: <CalendarDays className="w-4 h-4" /> },
    { key: "roster", label: "학생 명단 관리", icon: <UsersRound className="w-4 h-4" /> },
    ...(isAdmin
      ? [
          { key: "teachers", label: "교사 계정 관리", icon: <UserCog className="w-4 h-4" /> },
          { key: "cutoffs", label: "데이터 관리", icon: <Database className="w-4 h-4" /> },
        ]
      : []),
  ];

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

  return (
    <div className="max-w-5xl mx-auto w-full px-4 py-6 sm:py-10 flex-1 space-y-6">
      <DashboardHeader
        icon={<Contact className="w-5 h-5" />}
        actions={
          <>
            {profile?.dual_admin && (
              <button
                onClick={handleToggleAdminMode}
                disabled={togglingAdmin}
                title={`관리자 모드 ${profile.admin_mode_enabled ? "켜짐" : "꺼짐"}`}
                className={`p-2 rounded-xl transition border disabled:opacity-60 ${
                  profile.admin_mode_enabled
                    ? "bg-indigo-600 hover:bg-indigo-700 text-white border-indigo-600"
                    : "bg-slate-100 hover:bg-slate-200 text-slate-600 hover:text-slate-800 border-slate-200"
                }`}
              >
                <ShieldUser className="w-3.5 h-3.5" />
              </button>
            )}
            {canSwitchClass && (
              <select
                value={grade != null && classNo != null ? `${grade}-${classNo}` : ""}
                onChange={(e) => {
                  const [g, c] = e.target.value.split("-").map(Number);
                  setActiveClass(g, c);
                }}
                className="bg-white border border-slate-300 text-slate-800 text-sm font-bold rounded-xl px-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-500"
              >
                {classOptions.length === 0 && <option value="">등록된 반 없음</option>}
                {classOptions.map((c) => (
                  <option key={`${c.grade}-${c.classNo}`} value={`${c.grade}-${c.classNo}`}>
                    {c.label}
                  </option>
                ))}
              </select>
            )}
            <AppearanceSettingsButtons />
            <button
              onClick={() => setHelpModalOpen(true)}
              title="사용 매뉴얼"
              className="p-2 bg-slate-100 hover:bg-slate-200 text-slate-600 hover:text-slate-800 rounded-xl transition border border-slate-200"
            >
              <CircleHelp className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={() => setPwModalOpen(true)}
              title="비밀번호 변경"
              className="p-2 bg-slate-100 hover:bg-slate-200 text-slate-600 hover:text-slate-800 rounded-xl transition border border-slate-200"
            >
              <KeyRound className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={async () => {
                await signOut();
                router.replace("/");
              }}
              title="나가기"
              className="p-2 bg-rose-600 hover:bg-rose-700 text-white rounded-xl transition shadow-xs"
            >
              <LogOut className="w-3.5 h-3.5" />
            </button>
          </>
        }
      >
        <h2 className="text-lg font-bold text-slate-900 flex items-center gap-2">
          <span>{profile?.name} 선생님</span>
          {isAdmin && (
            <span className="text-[11px] bg-indigo-50 text-indigo-700 border border-indigo-200 font-bold px-2 py-0.5 rounded-full">
              전체관리자
            </span>
          )}
        </h2>
        {!isAdmin && grade != null && classNo != null && (
          <p className="text-[11px] text-slate-400 mt-0.5">
            {formatClassLabel(grade, classNo)} 담임
          </p>
        )}
      </DashboardHeader>

      <Tabs items={tabs} active={tab} onChange={(k) => setTab(k as TeacherTab)} />

      {!loading &&
      grade == null &&
      classNo == null &&
      tab !== "teachers" &&
      tab !== "cutoffs" &&
      tab !== "cutoffLookup" ? (
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
      ) : (
        <>
          {tab === "status" && <StatusTab />}
          {tab === "wonseo" && <WonseoManageTab />}
          {tab === "cutoffLookup" && <CutoffLookupTab roster={roster} />}
          {tab === "roster" && <RosterTab />}
          {tab === "calendar" && <TeacherCalendarTab />}
        </>
      )}
      {tab === "teachers" && isAdmin && <TeacherManageTab />}
      {tab === "cutoffs" && isAdmin && (
        <div className="space-y-5">
          <AdmissionCutoffUploadTab />
          <AdmissionOfferingUploadTab />
        </div>
      )}

      <ChangePasswordModal open={pwModalOpen} onClose={() => setPwModalOpen(false)} />
      <ManualHelpModal open={helpModalOpen} onClose={() => setHelpModalOpen(false)} />
    </div>
  );
}
