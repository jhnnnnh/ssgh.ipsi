"use client";

import { useState } from "react";
import { useAuth } from "@/components/providers/AuthProvider";
import { createClient } from "@/lib/supabase/client";
import { AdmissionProbabilityConsentGate } from "@/components/teacher/AdmissionProbabilityConsentGate";
import { AdmissionProbabilityCalculator } from "@/components/teacher/AdmissionProbabilityCalculator";
import type { Roster } from "@/lib/database.types";

/**
 * "합격 가능성 추정" 탭. 계정당 처음 한 번은 유의사항 동의 화면을 반드시 통과해야
 * 계산기를 쓸 수 있다(동의 시각은 profiles에 저장되어 기기를 바꿔도 유지된다).
 * 교사 화면에서는 roster를, 학생 화면에서는 studentId를 넘겨준다.
 */
export function AdmissionProbabilityTab({
  roster,
  studentId,
}: {
  roster?: Pick<Roster, "student_id" | "name">[];
  studentId?: string;
}) {
  const { profile, refreshProfile } = useAuth();
  const [agreeing, setAgreeing] = useState(false);
  const audience = studentId ? "student" : "teacher";

  async function handleAgree() {
    if (!profile) return;
    setAgreeing(true);
    const supabase = createClient();
    await supabase
      .from("profiles")
      .update({ admission_probability_consent_at: new Date().toISOString() })
      .eq("id", profile.id);
    await refreshProfile();
    setAgreeing(false);
  }

  if (!profile?.admission_probability_consent_at) {
    return <AdmissionProbabilityConsentGate onAgree={handleAgree} agreeing={agreeing} audience={audience} />;
  }

  return <AdmissionProbabilityCalculator roster={roster} studentId={studentId} />;
}
