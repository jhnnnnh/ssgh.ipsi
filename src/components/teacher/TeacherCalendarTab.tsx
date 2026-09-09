"use client";

import { useState } from "react";
import { useAuth } from "@/components/providers/AuthProvider";
import { useActiveClass } from "@/components/providers/ActiveClassProvider";
import { useConfirm } from "@/components/providers/ConfirmProvider";
import { useToast } from "@/components/providers/ToastProvider";
import { createClient } from "@/lib/supabase/client";
import { useCalendarEvents, type ResolvedCalendarEvent } from "@/lib/hooks/useCalendarEvents";
import { CalendarGrid } from "@/components/calendar/CalendarGrid";
import { Card } from "@/components/ui/Card";
import { CalendarEventModal } from "@/components/calendar/CalendarEventModal";
import { WonseoScheduleModal } from "@/components/calendar/WonseoScheduleModal";
import type { CalendarEventType } from "@/lib/database.types";

export function TeacherCalendarTab() {
  const { profile } = useAuth();
  const { grade, classNo, isAdmin } = useActiveClass();
  const showToast = useToast();
  const confirm = useConfirm();
  const { events, reload } = useCalendarEvents();
  const [scheduleModalOpen, setScheduleModalOpen] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingEvent, setEditingEvent] = useState<ResolvedCalendarEvent | null>(null);
  const [defaultDate, setDefaultDate] = useState<string | undefined>();

  const allowedTypes: CalendarEventType[] = isAdmin
    ? ["personal", "class", "grade"]
    : ["personal", "class"];

  function handleAdd(date?: string) {
    setEditingEvent(null);
    setDefaultDate(date);
    setModalOpen(true);
  }

  function handleEdit(event: ResolvedCalendarEvent) {
    setEditingEvent(event);
    setModalOpen(true);
  }

  async function handleDelete(event: ResolvedCalendarEvent) {
    const ok = await confirm({
      message: `"${event.resolvedTitle}" 일정을 삭제하시겠습니까?`,
      confirmLabel: "삭제",
      danger: true,
    });
    if (!ok) return;
    const supabase = createClient();
    const { error } = await supabase.from("calendar_events").delete().eq("id", event.id);
    if (error) {
      showToast("삭제에 실패했습니다.", "error");
      return;
    }
    showToast("삭제되었습니다.", "success");
    reload();
  }

  function canManage(event: ResolvedCalendarEvent) {
    if (event.type === "wonseo_schedule" || event.type === "class" || event.type === "personal") return true;
    if (event.type === "grade") return isAdmin;
    return false;
  }

  if (!profile || grade == null || classNo == null) {
    return (
      <Card padded={false} className="p-12 text-center">
        <p className="text-sm font-bold text-slate-600">담당 반 정보를 확인할 수 없습니다.</p>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <CalendarGrid
        events={events}
        onOpenSchedule={() => setScheduleModalOpen(true)}
        onAddEvent={handleAdd}
        onEditEvent={handleEdit}
        onDeleteEvent={handleDelete}
        canManageEvent={canManage}
        showStudentName
      />
      <CalendarEventModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        events={events}
        editingEvent={editingEvent}
        allowedTypes={allowedTypes}
        defaultDate={defaultDate}
        scope={{ grade, classNo }}
        createdBy={profile.id}
        onSaved={reload}
      />
      <WonseoScheduleModal
        open={scheduleModalOpen}
        onClose={() => setScheduleModalOpen(false)}
        scope={{ classScope: { grade, classNo } }}
        createdBy={profile.id}
        showStudentName
        onImported={reload}
      />
    </div>
  );
}
