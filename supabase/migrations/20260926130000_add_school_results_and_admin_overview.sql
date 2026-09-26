set search_path = public, extensions;

-- 우리 학교 학생들의 지난 수시 합불 결과(대교협 등에서 내려받은 엑셀). 원본 파일의 반·번호·이름은
-- 통계에 필요 없어 저장하지 않는다. result_year(지원한 해) 단위로 통째로 교체된다.
create table public.school_admission_results (
  id uuid primary key default gen_random_uuid(),
  result_year smallint not null,
  region text,
  university text not null,
  admission_type text,
  track text,
  department text not null,
  enrollment integer,
  final_stage text,
  fail_reason text,
  waitlist_rank integer,
  gpa numeric,
  uploaded_at timestamptz not null,
  created_at timestamptz not null default now()
);

create index school_admission_results_year_idx on public.school_admission_results (result_year);
create index school_admission_results_lookup_idx on public.school_admission_results (university, department);

alter table public.school_admission_results enable row level security;

create policy "school results select" on public.school_admission_results
  for select using (public.is_teacher());

create policy "school results write" on public.school_admission_results
  for all using (public.has_admin_capabilities()) with check (public.has_admin_capabilities());

-- 관리자 모드 "학년 현황" 화면용: 학년 전체 학생과 원서 카드를 한 번에 돌려준다. 담임을 겸하는
-- 관리자(dual_admin)는 wonseo_cards RLS상 자기 반만 보이므로, 관리자 모드일 때만 열리는
-- security definer 함수로 학년 전체를 읽는다. 카드가 없는 학생도 한 줄(card_id null)로 나온다.
create or replace function public.admin_wonseo_overview()
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
  recent_results jsonb
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
           c.is_submitted, c.calculated_grade, c.recent_results
    from public.roster r
    left join public.wonseo_cards c on c.student_id = r.student_id
    order by r.student_id, c.sort_order;
end;
$$;

revoke all on function public.admin_wonseo_overview() from public, anon;
grant execute on function public.admin_wonseo_overview() to authenticated;
