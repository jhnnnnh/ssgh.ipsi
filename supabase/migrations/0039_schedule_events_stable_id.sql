set search_path = public, extensions;

-- schedule_events 각 항목에 고정 id를 부여한다. 지금까지는 배열 안 위치(순서)로 캘린더의
-- "추가됨" 상태를 연결했는데, 다른 항목을 지우거나 순서를 바꾸면 위치가 밀리면서 엉뚱한
-- 항목이 "추가됨"으로 표시되는 문제가 있었다. id를 부여해 그 항목 자체를 계속 같은 것으로
-- 알아볼 수 있게 한다.
update public.wonseo_cards
set schedule_events = (
  select coalesce(jsonb_agg(elem || jsonb_build_object('id', gen_random_uuid()::text) order by ord), '[]'::jsonb)
  from jsonb_array_elements(schedule_events) with ordinality as t(elem, ord)
)
where jsonb_array_length(schedule_events) > 0;
