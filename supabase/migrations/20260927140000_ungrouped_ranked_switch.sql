set search_path = public, extensions;

-- "N지망 자동 배정" 스위치를 없애고, 지망 번호는 구역(그룹·미분류)의 "지망 번호 받기"로만 정한다.
-- roster.rank_auto_assign은 이제 "미분류 카드가 지망 번호를 받는지"를 뜻한다.
comment on column public.roster.rank_auto_assign is '미분류 원서 카드가 N지망 번호를 받는지(기본 켜짐). 번호 없는 카드의 지망 칸은 메모(wonseo_cards.rank)다.';

-- 번호 없는 카드의 지망 칸은 이제 메모로 보인다. 자동 배정을 쓰던 학생 카드에 남은 옛 번호 글자
-- ("1지망", "3", "3희망")는 예전에 자동 번호를 복사해 둔 흔적이라 지운다. 직접 번호를 쓰던 학생과
-- 다른 글자("후보" 등)는 그대로 둔다.
update public.wonseo_cards c
set rank = null
from public.roster r
where r.student_id = c.student_id
  and r.rank_auto_assign
  and c.rank ~ '^\s*\d+\s*(지망|희망)?\s*$';

-- 예전에는 번호 받는 그룹이 하나라도 있으면 미분류가 번호를 받지 않았다. 그런 학생은 화면이
-- 그대로 보이도록 미분류 스위치를 끈다.
update public.roster r
set rank_auto_assign = false
where r.rank_auto_assign
  and exists (select 1 from public.wonseo_card_groups g where g.student_id = r.student_id and g.is_ranked);
