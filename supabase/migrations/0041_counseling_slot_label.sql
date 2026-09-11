set search_path = public, extensions;

-- 시간대가 정해지지 않은 "예비" 상담 슬롯(예비1/예비2/예비3 등)을 지원한다. 이런 슬롯은
-- 특정 시각이 없으므로 start_time/end_time을 비워 두고 대신 label에 "예비1" 같은 이름을
-- 담는다 — 한 슬롯은 시간 슬롯이거나 라벨 슬롯이거나 둘 중 하나여야 한다(체크 제약).
alter table public.counseling_slots
  alter column start_time drop not null,
  alter column end_time drop not null,
  add column if not exists label text;

alter table public.counseling_slots
  drop constraint if exists counseling_slots_time_or_label_check;
alter table public.counseling_slots
  add constraint counseling_slots_time_or_label_check check (
    (label is not null and start_time is null and end_time is null)
    or (label is null and start_time is not null and end_time is not null)
  );

-- 같은 반의 같은 날짜에 같은 이름의 예비 슬롯이 중복 생성되지 않게 한다.
create unique index if not exists counseling_slots_date_class_label_uidx
  on public.counseling_slots (date, grade, class_no, label)
  where label is not null;
