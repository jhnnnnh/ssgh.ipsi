set search_path = public, extensions;

-- "접수 전" 수시 카드의 "일정 등록"(has_exam_date/exam_date_at/exam_memo) 기능을 없앤다.
-- 캘린더 연동은 이제 "접수한 원서"(is_submitted=true)의 schedule_events에서만 만들어지므로,
-- 이 기능으로 만들어졌던 calendar_events(type='wonseo_linked')는 참조하던 날짜·메모가
-- 함께 사라지기 전에 정리한다. 이미 입력돼 있던 값은 잃지 않도록 먼저 memo로 옮겨 붙인다.
update public.wonseo_cards
set memo = trim(both E'\n' from
  coalesce(memo || E'\n\n', '')
  || '[일정] ' || trim(coalesce(exam_memo || ' ', '') || coalesce(to_char(exam_date_at, 'YYYY-MM-DD'), ''))
)
where exam_date_at is not null or exam_memo is not null;

delete from public.calendar_events where type = 'wonseo_linked';

alter table public.wonseo_cards
  drop column has_exam_date,
  drop column exam_date,
  drop column exam_date_at,
  drop column exam_memo;
