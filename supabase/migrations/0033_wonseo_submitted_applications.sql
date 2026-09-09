set search_path = public, extensions;

-- "접수한 원서"(별표) 표시, 접수 후 발급된 수험번호, 그리고 카드 하나에 자유롭게 추가하는
-- 일정(논술/면접/실기, 1차 발표/2차 발표 등) 목록을 wonseo_cards에 추가한다. 일정 목록은
-- 이 앱이 이미 "최근 입결"(recent_results)에 쓰는 jsonb 배열 패턴을 그대로 따른다 —
-- 별도 테이블·RLS 없이 카드 수정 시 통째로 저장한다.
alter table public.wonseo_cards
  add column is_submitted boolean not null default false,
  add column application_number text,
  add column schedule_events jsonb not null default '[]'::jsonb;
