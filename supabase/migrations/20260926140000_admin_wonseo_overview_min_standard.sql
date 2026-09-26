set search_path = public, extensions;

-- 학년 현황의 수능최저 판정(관리자 테스트)에 카드의 최저기준 문구가 필요해 반환 컬럼을 추가한다.
-- 반환 타입이 바뀌어 create or replace로는 안 되므로 지우고 다시 만든다.
drop function if exists public.admin_wonseo_overview();

create function public.admin_wonseo_overview()
returns table (
  student_id text,
  student_name text,
  grade smallint,
  class_no smallint,
  card_id uuid,
  university text,
  department text,
  category text,
  level text,
  status text,
  is_submitted boolean,
  calculated_grade text,
  recent_results jsonb,
  min_standard text
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.has_admin_capabilities() then
    raise exception 'forbidden';
  end if;
  return query
    select r.student_id, r.name, r.grade::smallint, r.class_no::smallint,
           c.id, c.university, c.department, c.category, c.level, c.status,
           c.is_submitted, c.calculated_grade, c.recent_results, c.min_standard
    from public.roster r
    left join public.wonseo_cards c on c.student_id = r.student_id
    order by r.student_id, c.sort_order;
end;
$$;

revoke all on function public.admin_wonseo_overview() from public, anon;
grant execute on function public.admin_wonseo_overview() to authenticated;
