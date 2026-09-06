-- "입결 조회" 탭: 대학어디가 원본 데이터(admission_cutoffs)를 학교/학과/전형으로 직접
-- 검색해서 2023~2026학년도 입결을 보여준다. 카드 자동완성은 전형데이터(admission_offerings)
-- 기준으로 옮겨갔지만, 이 탭은 admission_cutoffs 원본을 그대로 찾는 게 목적이라 그 위에
-- 자동완성 RPC를 따로 둔다(0018/0019에서 만들었다가 0026에서 지운 것과 비슷한 모양).

create function public.autocomplete_cutoff_universities(p_query text, p_limit int default 20)
returns table(university text)
language sql
stable
set search_path = public, extensions
as $$
  select distinct university
  from public.admission_cutoffs
  where university ilike '%' || p_query || '%'
  order by university
  limit p_limit;
$$;

create function public.autocomplete_cutoff_departments(
  p_query text, p_university text default null, p_limit int default 20
)
returns table(university text, department text)
language sql
stable
set search_path = public, extensions
as $$
  select distinct university, department
  from public.admission_cutoffs
  where department ilike '%' || p_query || '%'
    and (p_university is null or university = p_university)
  order by university, department
  limit p_limit;
$$;

create function public.autocomplete_cutoff_admission_types(
  p_query text, p_university text default null, p_department text default null, p_limit int default 20
)
returns table(admission_type text, department text, track text)
language sql
stable
set search_path = public, extensions
as $$
  select distinct admission_type, department, track
  from public.admission_cutoffs
  where admission_type ilike '%' || p_query || '%'
    and (p_university is null or university = p_university)
    and (p_department is null or department = p_department)
  order by admission_type
  limit p_limit;
$$;
