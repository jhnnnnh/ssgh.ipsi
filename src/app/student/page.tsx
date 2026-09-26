"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { LogOut } from "lucide-react";
import { useAuth } from "@/components/providers/AuthProvider";
import { AppearanceSettingsButtons } from "@/components/settings/AppearanceSettingsButtons";
import { DashboardHeader } from "@/components/ui/DashboardHeader";
import type { TabItem } from "@/components/ui/Tabs";
import { SlotBookingTab } from "@/components/student/SlotBookingTab";
import { WonseoTab } from "@/components/student/WonseoTab";
import { CutoffLookupTab } from "@/components/wonseo/CutoffLookupTab";
import { StudentCalendarTab } from "@/components/student/StudentCalendarTab";
import { AdmissionProbabilityTab } from "@/components/teacher/AdmissionProbabilityTab";
import { useHashTab } from "@/lib/hooks/useHashTab";

type StudentTab = "consulting" | "wonseo" | "cutoffs" | "probability" | "calendar";

const STUDENT_TABS: TabItem[] = [
  { key: "consulting", label: "상담신청" },
  { key: "wonseo", label: "수시원서" },
  { key: "cutoffs", label: "대입정보" },
  { key: "probability", label: "합격률계산기" },
  { key: "calendar", label: "입시일정" },
];
const STUDENT_TAB_KEYS = STUDENT_TABS.map((item) => item.key as StudentTab);

export default function StudentPage() {
  const router = useRouter();
  const { session, profile, loading, signOut } = useAuth();
  const [tab, setTab] = useHashTab<StudentTab>("consulting", STUDENT_TAB_KEYS);

  useEffect(() => {
    if (loading) return;
    if (!session || !profile) {
      router.replace("/");
      return;
    }
    if (profile.role !== "student" || !profile.student_id) {
      router.replace("/teacher");
    }
  }, [loading, session, profile, router]);

  if (loading || !profile || profile.role !== "student" || !profile.student_id) {
    return (
      <div className="app-loading" role="status" aria-live="polite">
        불러오는 중…
      </div>
    );
  }

  return (
    <div className="dashboard-page">
      <a className="app-skip-link" href="#app-tab-panel">본문으로 건너뛰기</a>
      <DashboardHeader
        context={`${profile.student_id} ${profile.name}`}
        items={STUDENT_TABS}
        active={tab}
        onChange={(key) => setTab(key as StudentTab)}
        actions={
          <>
            <AppearanceSettingsButtons className="header-icon-action" />
            <button
              type="button"
              onClick={async () => {
                await signOut();
                router.replace("/");
              }}
              aria-label="로그아웃"
              title="로그아웃"
              className="header-icon-action is-danger"
            >
              <LogOut className="w-4 h-4" aria-hidden="true" />
            </button>
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
          {tab === "consulting" && <SlotBookingTab studentId={profile.student_id} />}
          {tab === "wonseo" && <WonseoTab studentId={profile.student_id} />}
          {tab === "cutoffs" && <CutoffLookupTab studentId={profile.student_id} />}
          {tab === "probability" && <AdmissionProbabilityTab studentId={profile.student_id} />}
          {tab === "calendar" && <StudentCalendarTab studentId={profile.student_id} />}
        </main>

        <footer className="app-footer">
          <p>© 2026. jinhyeokapply All rights reserved.</p>
        </footer>
      </div>
    </div>
  );
}
