set search_path = public, extensions;

-- "합격 가능성 추정" 계산 결과를 목록으로 저장해 두는 테이블. 입력값(input)과 계산 시점의
-- 결과 요약을 함께 스냅샷으로 저장해, 나중에 다시 계산하지 않고도 목록에서 바로 확률을
-- 볼 수 있게 한다(다시 열어 보면 그래프 표시를 위해 같은 입력으로 한 번 더 계산한다).
-- RLS는 wonseo_cards와 동일한 규칙(관리자 · 담임 · 본인)을 그대로 따른다.
create table public.admission_probability_saves (
  id uuid primary key default gen_random_uuid(),
  student_id text not null references public.roster(student_id) on delete cascade,
  university text not null,
  department text,
  admission_type text,
  /** userScore/targetQuota/expectedCompetition/c50/c70/quota/turnover/applicants 스냅샷. */
  input jsonb not null,
  prob numeric not null,
  prob_low numeric not null,
  prob_high numeric not null,
  p50_predicted numeric not null,
  p70_predicted numeric not null,
  created_by uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now()
);

alter table public.admission_probability_saves enable row level security;

create policy "admission_probability_saves select" on public.admission_probability_saves
  for select using (
    is_admin()
    or is_homeroom_for((substring(student_id from 1 for 1))::smallint, (substring(student_id from 3 for 1))::smallint)
    or student_id = current_student_id()
  );

create policy "admission_probability_saves insert" on public.admission_probability_saves
  for insert with check (
    is_admin()
    or is_homeroom_for((substring(student_id from 1 for 1))::smallint, (substring(student_id from 3 for 1))::smallint)
    or student_id = current_student_id()
  );

create policy "admission_probability_saves delete" on public.admission_probability_saves
  for delete using (
    is_admin()
    or is_homeroom_for((substring(student_id from 1 for 1))::smallint, (substring(student_id from 3 for 1))::smallint)
    or student_id = current_student_id()
  );
