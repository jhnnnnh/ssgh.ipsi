"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";

/**
 * 학생별 "미분류 카드가 지망 번호를 받는지" 스위치(roster.rank_auto_assign 컬럼)를 읽는다.
 * 컬럼 이름은 예전 "N지망 자동 배정" 시절 것을 그대로 쓴다. 켜고 끄는 저장은 useWonseoCards가 한다.
 */
export function useUngroupedRanked(studentId: string) {
  const [ungroupedRanked, setUngroupedRanked] = useState(true);

  useEffect(() => {
    if (!studentId) return;
    let cancelled = false;
    createClient()
      .from("roster")
      .select("rank_auto_assign")
      .eq("student_id", studentId)
      .maybeSingle()
      .then(({ data }) => {
        if (!cancelled) setUngroupedRanked(data?.rank_auto_assign ?? true);
      });
    return () => {
      cancelled = true;
    };
  }, [studentId]);

  return { ungroupedRanked, setUngroupedRanked };
}
