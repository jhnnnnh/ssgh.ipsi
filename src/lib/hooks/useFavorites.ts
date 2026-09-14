"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useActiveClass } from "@/components/providers/ActiveClassProvider";
import type { SlotFavorite } from "@/lib/database.types";

export function useFavorites() {
  const supabase = useMemo(() => createClient(), []);
  const { grade, classNo } = useActiveClass();
  const [favorites, setFavorites] = useState<SlotFavorite[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    if (grade == null || classNo == null) {
      setFavorites([]);
      setError(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const { data, error: queryError } = await supabase
        .from("slot_favorites")
        .select("*")
        .eq("grade", grade)
        .eq("class_no", classNo)
        .order("start_time", { ascending: true });
      if (queryError) throw queryError;
      setFavorites(data ?? []);
    } catch {
      setFavorites([]);
      setError("즐겨찾기 시간을 불러오지 못했습니다. 다시 시도해 주세요.");
    } finally {
      setLoading(false);
    }
  }, [classNo, grade, supabase]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void reload();
  }, [reload]);

  return { favorites, loading, error, reload };
}
