import { createClient } from "@/lib/supabase/client";
import { DEFAULT_EVENT_COLOR } from "@/lib/calendar-constants";

export type ScheduleItem = {
  /** schedule_events 배열 안에서의 위치로 만든 안정적인 키(예: "sched-0"). */
  kind: string;
  label: string;
  /** "YYYY-MM-DD" */
  date: string;
  added: boolean;
};

export type CardScheduleGroup = {
  cardId: string;
  studentId: string;
  studentName: string | null;
  grade: number | null;
  classNo: number | null;
  university: string;
  department: string | null;
  subCategory: string | null;
  items: ScheduleItem[];
};

/**
 * "내 원서 일정" 팝업의 목록을 만든다. "접수한 원서"(is_submitted=true)로 표시된 카드의
 * schedule_events(자유롭게 추가한 일정) 중 날짜가 "YYYY-MM-DD" 형식으로 확정된 항목만 모아
 * 보여준다. 이미 캘린더에 넣은 항목은 added:true로 표시해 중복 추가를 막는다. 학생 모드는
 * studentId만, 교사 모드는 classScope만 넘긴다.
 */
export async function findWonseoScheduleGroups({
  studentId,
  classScope,
}: {
  studentId?: string;
  classScope?: { grade: number; classNo: number };
}): Promise<CardScheduleGroup[]> {
  const supabase = createClient();

  let studentIds: string[];
  let gradeByStudent: Map<string, { grade: number; classNo: number }>;
  let nameByStudent = new Map<string, string>();

  if (studentId) {
    const [{ data: grade }, { data: classNo }] = await Promise.all([
      supabase.rpc("current_student_grade"),
      supabase.rpc("current_student_class_no"),
    ]);
    if (grade == null || classNo == null) return [];
    studentIds = [studentId];
    gradeByStudent = new Map([[studentId, { grade, classNo }]]);
  } else if (classScope) {
    const { data: rosterRows } = await supabase
      .from("roster")
      .select("student_id, name, grade, class_no")
      .eq("grade", classScope.grade)
      .eq("class_no", classScope.classNo);
    studentIds = (rosterRows ?? []).map((r) => r.student_id);
    gradeByStudent = new Map(
      (rosterRows ?? []).map((r) => [r.student_id, { grade: r.grade!, classNo: r.class_no! }]),
    );
    nameByStudent = new Map((rosterRows ?? []).map((r) => [r.student_id, r.name]));
  } else {
    return [];
  }

  if (studentIds.length === 0) return [];

  const { data: cards } = await supabase
    .from("wonseo_cards")
    .select("id, student_id, university, department, sub_category, schedule_events")
    .in("student_id", studentIds)
    .eq("is_submitted", true)
    .not("university", "is", null);
  if (!cards || cards.length === 0) return [];

  const cardIds = cards.map((c) => c.id);
  const { data: existing } = await supabase
    .from("calendar_events")
    .select("wonseo_card_id, kind")
    .eq("type", "wonseo_schedule")
    .in("wonseo_card_id", cardIds);

  const addedSchedule = new Set((existing ?? []).map((e) => `${e.wonseo_card_id}::${e.kind}`));

  const groups: CardScheduleGroup[] = [];
  cards.forEach((card) => {
    if (!card.university) return;
    const items: ScheduleItem[] = (card.schedule_events ?? [])
      .map((s, i) => ({ kind: `sched-${i}`, label: s.label, date: s.date }))
      .filter((s): s is { kind: string; label: string; date: string } => /^\d{4}-\d{2}-\d{2}$/.test(s.date))
      .map((s) => ({
        ...s,
        label: s.label || "일정",
        added: addedSchedule.has(`${card.id}::${s.kind}`),
      }));
    if (items.length === 0) return;

    const cls = gradeByStudent.get(card.student_id);
    groups.push({
      cardId: card.id,
      studentId: card.student_id,
      studentName: nameByStudent.get(card.student_id) ?? null,
      grade: cls?.grade ?? null,
      classNo: cls?.classNo ?? null,
      university: card.university,
      department: card.department,
      subCategory: card.sub_category,
      items,
    });
  });

  return groups;
}

/** 목록의 항목 하나를 실제로 캘린더에 추가한다. */
export async function addScheduleEvent({
  cardId,
  studentId,
  grade,
  classNo,
  university,
  kind,
  label,
  date,
  createdBy,
}: {
  cardId: string;
  studentId: string;
  grade: number | null;
  classNo: number | null;
  university: string;
  kind: string;
  label: string;
  date: string;
  createdBy: string;
}): Promise<void> {
  const supabase = createClient();

  const { error } = await supabase.from("calendar_events").insert({
    type: "wonseo_schedule",
    color: DEFAULT_EVENT_COLOR,
    student_id: studentId,
    grade,
    class_no: classNo,
    wonseo_card_id: cardId,
    kind,
    title: `${university} ${label}`,
    date,
    created_by: createdBy,
  });
  if (error) throw error;
}
