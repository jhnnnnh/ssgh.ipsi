"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import type { CounselingSlot } from "@/lib/database.types";

/**
 * 상담 슬롯 목록을 구독한다.
 * `classFilter`를 생략하면(학생 쪽 호출) 필터 없이 전체를 조회하되, RLS가
 * 학생 본인 반 슬롯만 돌려주므로 결과적으로 자기 반만 보인다.
 * 교사 화면(특히 전체관리자)은 한 번에 여러 반을 볼 수 있어 명시적으로
 * `{grade, classNo}`를 넘겨 지금 보고 있는 반으로 좁혀야 한다. `null`을 넘기면
 * (아직 반이 정해지지 않은 상태) 조회하지 않고 빈 목록을 유지한다.
 */
export function useCounselingSlots(
  classFilter?: { grade: number; classNo: number } | null,
) {
  const supabase = useMemo(() => createClient(), []);
  const [slots, setSlots] = useState<CounselingSlot[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const filterPending = classFilter === null;
  const filterGrade = classFilter?.grade;
  const filterClassNo = classFilter?.classNo;

  const reload = useCallback(async () => {
    if (filterPending) {
      setSlots([]);
      setError(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    let query = supabase
      .from("counseling_slots")
      .select("*")
      .order("date", { ascending: true })
      .order("start_time", { ascending: true });
    if (filterGrade != null && filterClassNo != null) {
      query = query.eq("grade", filterGrade).eq("class_no", filterClassNo);
    }
    try {
      const { data, error: queryError } = await query;
      if (queryError) throw queryError;
      setSlots(data ?? []);
    } catch {
      setSlots([]);
      setError("상담 슬롯을 불러오지 못했습니다. 다시 시도해 주세요.");
    } finally {
      setLoading(false);
    }
  }, [filterClassNo, filterGrade, filterPending, supabase]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void reload();

    const channel = supabase
      .channel("counseling_slots_changes")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "counseling_slots" },
        () => void reload(),
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [reload, supabase]);

  return { slots, loading, error, reload };
}
