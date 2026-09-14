"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import type { CalendarEvent } from "@/lib/database.types";

export type ResolvedCalendarEvent = CalendarEvent & {
  resolvedTitle: string;
  resolvedDate: string | null;
  studentName: string | null;
};

type RawRow = CalendarEvent & {
  roster: { name: string } | null;
};

/** RLS가 이미 보이는 범위를 걸러주므로, 여기서는 그냥 전부 불러와서 화면에서 월별로 나눠 쓴다. */
export function useCalendarEvents() {
  const supabase = useMemo(() => createClient(), []);
  const [events, setEvents] = useState<ResolvedCalendarEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const { data, error: queryError } = await supabase
        .from("calendar_events")
        .select("*, roster(name)")
        .returns<RawRow[]>();
      if (queryError) throw queryError;

      const resolved: ResolvedCalendarEvent[] = (data ?? []).map((row) => {
        const { roster, ...event } = row;
        return {
          ...event,
          resolvedTitle: event.title ?? "",
          resolvedDate: event.date,
          studentName: roster?.name ?? null,
        };
      });
      setEvents(resolved);
    } catch {
      setEvents([]);
      setError("입시 일정을 불러오지 못했습니다. 다시 시도해 주세요.");
    } finally {
      setLoading(false);
    }
  }, [supabase]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void reload();
    const channel = supabase
      .channel("calendar_events_changes")
      .on("postgres_changes", { event: "*", schema: "public", table: "calendar_events" }, () => void reload())
      .on("postgres_changes", { event: "*", schema: "public", table: "wonseo_cards" }, () => void reload())
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [reload, supabase]);

  return { events, loading, error, reload };
}
