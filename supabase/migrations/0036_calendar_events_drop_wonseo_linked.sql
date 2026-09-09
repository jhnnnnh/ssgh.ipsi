set search_path = public, extensions;

-- wonseo_linked 이벤트 유형(카드의 exam_date_at/exam_memo를 그대로 참조하던 "일정 등록" 연동)은
-- 0035에서 그 원본 컬럼과 함께 정리됐다. 남아 있던 체크 제약에서도 이 유형을 없앤다.
alter table public.calendar_events drop constraint calendar_events_type_check;
alter table public.calendar_events add constraint calendar_events_type_check
  check (type = any (array['wonseo_schedule', 'personal', 'class', 'grade']));

alter table public.calendar_events drop constraint calendar_events_shape;
alter table public.calendar_events add constraint calendar_events_shape
  check (
    (type = 'wonseo_schedule' and wonseo_card_id is not null and student_id is not null and title is not null and date is not null and kind is not null)
    or (type = 'personal' and wonseo_card_id is null and title is not null and date is not null and kind is null)
    or (type = 'class' and grade is not null and class_no is not null and student_id is null and wonseo_card_id is null and title is not null and date is not null and kind is null)
    or (type = 'grade' and grade is null and class_no is null and student_id is null and wonseo_card_id is null and title is not null and date is not null and kind is null)
  );
