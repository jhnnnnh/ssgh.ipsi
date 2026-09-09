"use client";

import { useState } from "react";
import { useAuth } from "@/components/providers/AuthProvider";
import { useToast } from "@/components/providers/ToastProvider";
import { useConfirm } from "@/components/providers/ConfirmProvider";
import { createClient } from "@/lib/supabase/client";
import { useCalendarEvents, type ResolvedCalendarEvent } from "@/lib/hooks/useCalendarEvents";
import { CalendarGrid } from "@/components/calendar/CalendarGrid";
import { CalendarEventModal } from "@/components/calendar/CalendarEventModal";
import { WonseoScheduleModal } from "@/components/calendar/WonseoScheduleModal";

export function StudentCalendarTab({ studentId }: { studentId: string }) {
  const { profile } = useAuth();
  const showToast = useToast();
  const confirm = useConfirm();
  const { events, reload } = useCalendarEvents();
  const [scheduleModalOpen, setScheduleModalOpen] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingEvent, setEditingEvent] = useState<ResolvedCalendarEvent | null>(null);
  const [defaultDate, setDefaultDate] = useState<string | undefined>();

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
    return event.type === "wonseo_schedule" || event.type === "personal";
  }

  if (!profile) return null;

  return (
    <div className="space-y-6">
      <CalendarGrid
        events={events}
        onOpenSchedule={() => setScheduleModalOpen(true)}
        onAddEvent={handleAdd}
        onEditEvent={handleEdit}
        onDeleteEvent={handleDelete}
        canManageEvent={canManage}
      />
      <CalendarEventModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        events={events}
        editingEvent={editingEvent}
        allowedTypes={["personal"]}
        defaultDate={defaultDate}
        scope={{ studentId }}
        createdBy={profile.id}
        onSaved={reload}
      />
      <WonseoScheduleModal
        open={scheduleModalOpen}
        onClose={() => setScheduleModalOpen(false)}
        scope={{ studentId }}
        createdBy={profile.id}
        onImported={reload}
      />
    </div>
  );
}
