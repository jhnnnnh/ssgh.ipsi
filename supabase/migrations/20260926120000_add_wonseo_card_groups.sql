set search_path = public, extensions;

-- 학생이 직접 만드는 원서 카드 그룹(예: "최종 후보", "고민 중"). is_ranked가 켜진 그룹의
-- 카드만 N지망 번호를 받는다. 그룹을 지우면 카드는 지워지지 않고 미분류(group_id null)로 돌아간다.
create table public.wonseo_card_groups (
  id uuid primary key default gen_random_uuid(),
  student_id text not null references public.roster(student_id) on delete cascade,
  name text not null check (char_length(name) between 1 and 20),
  sort_order integer not null default 0,
  is_ranked boolean not null default false,
  created_at timestamptz not null default now()
);

create index wonseo_card_groups_student_id_idx on public.wonseo_card_groups (student_id);

alter table public.wonseo_cards
  add column group_id uuid references public.wonseo_card_groups(id) on delete set null;

create index wonseo_cards_group_id_idx on public.wonseo_cards (group_id);

alter table public.wonseo_card_groups enable row level security;

create policy "wonseo groups select" on public.wonseo_card_groups
  for select using (
    is_admin()
    or is_homeroom_for((substring(student_id from 1 for 1))::smallint, (substring(student_id from 3 for 1))::smallint)
    or student_id = current_student_id()
  );

create policy "wonseo groups insert" on public.wonseo_card_groups
  for insert with check (
    is_admin()
    or is_homeroom_for((substring(student_id from 1 for 1))::smallint, (substring(student_id from 3 for 1))::smallint)
    or student_id = current_student_id()
  );

create policy "wonseo groups update" on public.wonseo_card_groups
  for update using (
    is_admin()
    or is_homeroom_for((substring(student_id from 1 for 1))::smallint, (substring(student_id from 3 for 1))::smallint)
    or student_id = current_student_id()
  ) with check (
    is_admin()
    or is_homeroom_for((substring(student_id from 1 for 1))::smallint, (substring(student_id from 3 for 1))::smallint)
    or student_id = current_student_id()
  );

create policy "wonseo groups delete" on public.wonseo_card_groups
  for delete using (
    is_admin()
    or is_homeroom_for((substring(student_id from 1 for 1))::smallint, (substring(student_id from 3 for 1))::smallint)
    or student_id = current_student_id()
  );
