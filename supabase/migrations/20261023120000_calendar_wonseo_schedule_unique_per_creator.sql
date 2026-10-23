drop index if exists public.calendar_events_wonseo_schedule_key;

-- 학생과 교사가 각자 자기 캘린더에 같은 원서 일정을 넣을 수 있도록, 중복 기준에 작성자(created_by)를 더한다.
-- 0038에서 wonseo_schedule 조회·관리를 작성자 본인 기준으로 바꾸면서 이 인덱스만 빠져 있었다.
create unique index calendar_events_wonseo_schedule_key
  on public.calendar_events (wonseo_card_id, kind, created_by)
  where type = 'wonseo_schedule';
