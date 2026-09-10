"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { CalendarDays, FileSignature, LogOut, MessageCircle, Percent, School, Search } from "lucide-react";
import { useAuth } from "@/components/providers/AuthProvider";
import { AppearanceSettingsButtons } from "@/components/settings/AppearanceSettingsButtons";
import { DashboardHeader } from "@/components/ui/DashboardHeader";
import { Tabs } from "@/components/ui/Tabs";
import { SlotBookingTab } from "@/components/student/SlotBookingTab";
import { WonseoTab } from "@/components/student/WonseoTab";
import { CutoffLookupTab } from "@/components/wonseo/CutoffLookupTab";
import { StudentCalendarTab } from "@/components/student/StudentCalendarTab";
import { AdmissionProbabilityTab } from "@/components/teacher/AdmissionProbabilityTab";

type StudentTab = "consulting" | "wonseo" | "cutoffs" | "probability" | "calendar";

export default function StudentPage() {
  const router = useRouter();
  const { session, profile, loading, signOut } = useAuth();
  const [tab, setTab] = useState<StudentTab>("consulting");

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
      <div className="max-w-4xl mx-auto w-full px-4 py-10 flex-1 flex items-center justify-center">
        <p className="text-sm text-slate-400">불러오는 중...</p>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto w-full px-4 py-6 sm:py-10 flex-1 space-y-6">
      <DashboardHeader
        icon={<School className="w-5 h-5" />}
        actions={
          <>
            <AppearanceSettingsButtons />
            <button
              onClick={async () => {
                await signOut();
                router.replace("/");
              }}
              title="로그아웃"
              className="p-2 bg-rose-600 hover:bg-rose-700 text-white rounded-xl transition shadow-xs"
            >
              <LogOut className="w-3.5 h-3.5" />
            </button>
          </>
        }
      >
        <span className="text-lg font-bold emphasis-title tracking-tight text-slate-900">
          {profile.student_id} {profile.name}
        </span>
      </DashboardHeader>

      <Tabs
        items={[
          { key: "consulting", label: "상담신청", icon: <MessageCircle className="w-4 h-4" /> },
          { key: "wonseo", label: "수시원서", icon: <FileSignature className="w-4 h-4" /> },
          { key: "cutoffs", label: "대입정보", icon: <Search className="w-4 h-4" /> },
          { key: "probability", label: "합격률계산기", icon: <Percent className="w-4 h-4" /> },
          { key: "calendar", label: "입시일정", icon: <CalendarDays className="w-4 h-4" /> },
        ]}
        active={tab}
        onChange={(k) => setTab(k as StudentTab)}
      />

      {tab === "consulting" && <SlotBookingTab studentId={profile.student_id} />}
      {tab === "wonseo" && <WonseoTab studentId={profile.student_id} />}
      {tab === "cutoffs" && <CutoffLookupTab studentId={profile.student_id} />}
      {tab === "probability" && <AdmissionProbabilityTab studentId={profile.student_id} />}
      {tab === "calendar" && <StudentCalendarTab studentId={profile.student_id} />}

      <footer className="mt-6 text-center text-xs text-slate-400 pb-6 border-t border-slate-200/60 pt-6">
        <p>© 2026. jinhyeokapply All rights reserved.</p>
      </footer>
    </div>
  );
}
