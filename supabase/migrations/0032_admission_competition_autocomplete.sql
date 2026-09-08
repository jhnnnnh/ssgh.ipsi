-- "작년 경쟁률 조회"에서 자유입력(대학/학과/세부전형명)을 쓰면, 세부전형명 자동완성이
-- admission_cutoffs(대학어디가) 표기를 보여주는데 실제 경쟁률 아카이브
-- (admission_competition_history)의 전형명은 표기가 달라서(예: "교과(교과성적)" vs
-- "교과성적우수인재전형") 골라도 못 찾거나, 비워두면 그 대학의 전형이 전부 쏟아진다.
-- 이 문제를 근본적으로 없애기 위해 대학→학과→전형을 아카이브 데이터 자체에서 순서대로
-- 골라 나가는 단계별 선택 팝업을 만든다. 그 팝업이 쓸 자동완성 RPC를 0029와 같은 모양으로
-- admission_competition_history 위에 따로 둔다.

create function public.autocomplete_competition_universities(p_query text default '', p_limit int default 200)
returns table(university text)
language sql
stable
set search_path = public, extensions
as $$
  select distinct university
  from public.admission_competition_history
  where university ilike '%' || coalesce(p_query, '') || '%'
  order by university
  limit p_limit;
$$;

create function public.autocomplete_competition_departments(p_university text, p_limit int default 500)
returns table(department text)
language sql
stable
set search_path = public, extensions
as $$
  select distinct department
  from public.admission_competition_history
  where university = p_university
    and department is not null
  order by department
  limit p_limit;
$$;

create function public.autocomplete_competition_has_summary(p_university text)
returns boolean
language sql
stable
set search_path = public, extensions
as $$
  select exists(
    select 1 from public.admission_competition_history
    where university = p_university and department is null
  );
$$;

create function public.autocomplete_competition_admission_types(p_university text, p_department text default null)
returns table(admission_type text)
language sql
stable
set search_path = public, extensions
as $$
  select distinct admission_type
  from public.admission_competition_history
  where university = p_university
    and department is not distinct from p_department
  order by admission_type
  limit 200;
$$;
