"use client";

import { useCallback, useEffect, useId, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useActiveClass } from "@/components/providers/ActiveClassProvider";
import type { Profile, Roster } from "@/lib/database.types";

export function useRoster() {
  const supabase = useMemo(() => createClient(), []);
  const { grade, classNo } = useActiveClass();
  // 이 훅을 여러 컴포넌트가 동시에 쓸 수 있어서(예: 상위 페이지와 그 안의 탭이 각자
  // useRoster를 호출), 채널 이름이 고정값이면 "같은 이름으로 이미 구독 중"이라는
  // 런타임 에러로 화면이 통째로 죽는다. 훅 인스턴스마다 고유한 채널 이름을 쓴다.
  const instanceId = useId();
  const [roster, setRoster] = useState<Roster[]>([]);
  const [studentProfiles, setStudentProfiles] = useState<Profile[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    if (grade == null || classNo == null) {
      setRoster([]);
      setStudentProfiles([]);
      setError(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const [rosterResult, profileResult] = await Promise.all([
        supabase
          .from("roster")
          .select("*")
          .eq("grade", grade)
          .eq("class_no", classNo)
          .order("student_id", { ascending: true }),
        supabase.from("profiles").select("*").eq("role", "student"),
      ]);
      if (rosterResult.error) throw rosterResult.error;
      if (profileResult.error) throw profileResult.error;
      setRoster(rosterResult.data ?? []);
      setStudentProfiles(profileResult.data ?? []);
    } catch {
      setRoster([]);
      setStudentProfiles([]);
      setError("학생 명단을 불러오지 못했습니다. 다시 시도해 주세요.");
    } finally {
      setLoading(false);
    }
  }, [classNo, grade, supabase]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void reload();
    const channel = supabase
      .channel(`roster_changes:${instanceId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "roster" }, () => void reload())
      .on("postgres_changes", { event: "*", schema: "public", table: "profiles" }, () => void reload())
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [instanceId, reload, supabase]);

  const passwordSetIds = useMemo(
    () => new Set(studentProfiles.map((p) => p.student_id)),
    [studentProfiles],
  );

  return { roster, passwordSetIds, loading, error, reload };
}
