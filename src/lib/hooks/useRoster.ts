"use client";

import { useEffect, useId, useMemo, useState } from "react";
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

  const reload = async () => {
    if (grade == null || classNo == null) {
      setRoster([]);
      setStudentProfiles([]);
      setLoading(false);
      return;
    }
    const [{ data: rosterData }, { data: profileData }] = await Promise.all([
      supabase
        .from("roster")
        .select("*")
        .eq("grade", grade)
        .eq("class_no", classNo)
        .order("student_id", { ascending: true }),
      supabase.from("profiles").select("*").eq("role", "student"),
    ]);
    setRoster(rosterData ?? []);
    setStudentProfiles(profileData ?? []);
    setLoading(false);
  };

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    reload();
    const channel = supabase
      .channel(`roster_changes:${instanceId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "roster" }, () => reload())
      .on("postgres_changes", { event: "*", schema: "public", table: "profiles" }, () => reload())
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [grade, classNo]);

  const passwordSetIds = useMemo(
    () => new Set(studentProfiles.map((p) => p.student_id)),
    [studentProfiles],
  );

  return { roster, passwordSetIds, loading, reload };
}
