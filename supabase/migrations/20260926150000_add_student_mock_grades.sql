set search_path = public, extensions;

-- 관리자 학년 현황(테스트)의 수능최저 판정용 학생별 최근 모의고사 등급. 아직 관리자만 읽고 쓴다.
create table public.student_mock_grades (
  student_id text primary key references public.roster(student_id) on delete cascade,
  korean smallint check (korean between 1 and 9),
  math smallint check (math between 1 and 9),
  math_subject text not null default '확통' check (math_subject in ('확통', '미적', '기하')),
  english smallint check (english between 1 and 9),
  inquiry1 smallint check (inquiry1 between 1 and 9),
  inquiry2 smallint check (inquiry2 between 1 and 9),
  inquiry_type text not null default '사' check (inquiry_type in ('사', '과')),
  history smallint check (history between 1 and 9),
  updated_at timestamptz not null default now()
);

alter table public.student_mock_grades enable row level security;

create policy "mock grades admin" on public.student_mock_grades
  for all using (public.has_admin_capabilities()) with check (public.has_admin_capabilities());
