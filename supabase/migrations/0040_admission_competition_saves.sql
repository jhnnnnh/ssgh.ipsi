set search_path = public, extensions;

-- "대입 정보 > 경쟁률 조회"에서 찾아본 작년 경쟁률을 목록으로 저장해 두는 테이블.
-- admission_probability_saves와 달리 경쟁률 조회는 계산이 아니라 조회이므로 입력·결과
-- 스냅샷 없이 대학/학과/전형만 저장해 두고, 다시 열어 보면 그 값으로 다시 조회한다.
-- RLS는 admission_probability_saves와 동일한 규칙(관리자 · 담임 · 본인)을 그대로 따른다.
create table public.admission_competition_saves (
  id uuid primary key default gen_random_uuid(),
  student_id text not null references public.roster(student_id) on delete cascade,
  university text not null,
  department text,
  admission_type text,
  created_by uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now()
);

alter table public.admission_competition_saves enable row level security;

create policy "admission_competition_saves select" on public.admission_competition_saves
  for select using (
    is_admin()
    or is_homeroom_for((substring(student_id from 1 for 1))::smallint, (substring(student_id from 3 for 1))::smallint)
    or student_id = current_student_id()
  );

create policy "admission_competition_saves insert" on public.admission_competition_saves
  for insert with check (
    is_admin()
    or is_homeroom_for((substring(student_id from 1 for 1))::smallint, (substring(student_id from 3 for 1))::smallint)
    or student_id = current_student_id()
  );

create policy "admission_competition_saves delete" on public.admission_competition_saves
  for delete using (
    is_admin()
    or is_homeroom_for((substring(student_id from 1 for 1))::smallint, (substring(student_id from 3 for 1))::smallint)
    or student_id = current_student_id()
  );
