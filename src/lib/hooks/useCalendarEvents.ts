"use client";

import { useEffect, useMemo, useState } from "react";
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

  const reload = async () => {
    const { data } = await supabase
      .from("calendar_events")
      .select("*, roster(name)")
      .returns<RawRow[]>();

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
    setLoading(false);
  };

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    reload();
    const channel = supabase
      .channel("calendar_events_changes")
      .on("postgres_changes", { event: "*", schema: "public", table: "calendar_events" }, () => reload())
      .on("postgres_changes", { event: "*", schema: "public", table: "wonseo_cards" }, () => reload())
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return { events, loading, reload };
}
