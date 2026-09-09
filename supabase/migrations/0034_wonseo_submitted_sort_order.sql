set search_path = public, extensions;

-- "접수한 원서" 화면에서 드래그로 순서를 바꿔도 "접수하기 전" 화면의 카드 순서(sort_order)에
-- 영향을 주면 안 된다는 피드백을 반영해, 두 화면의 순서를 완전히 분리한다.
alter table public.wonseo_cards
  add column submitted_sort_order int not null default 0;
