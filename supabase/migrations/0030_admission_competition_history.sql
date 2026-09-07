set search_path = public, extensions;

-- "작년 이맘때 경쟁률 조회" 기능용 원본 데이터. 대학어디가류 아카이브 엑셀(대학별 시트,
-- 시간대별 지원인원/경쟁률)에서 뽑아낸 시계열을 대학+전형+학과 조합 하나당 한 행으로
-- 압축해서 저장한다(시간대마다 행을 나누면 수백만 행이 되어 조회가 느려지고 테이블도
-- 커진다 — 이 기능은 항상 "그 조합의 전체 시계열을 통째로" 읽는 용도라 JSON 배열
-- 하나로 묶어 두는 편이 훨씬 간단하고 빠르다).
-- department가 null인 행은 학과 구분 없는 "전형 전체" 요약 시계열이다(정확히 일치하는
-- 학과 데이터가 없을 때의 대체용).
create table public.admission_competition_history (
  id uuid primary key default gen_random_uuid(),
  university text not null,
  admission_type text not null,
  college text,
  department text,
  enrollment integer,
  -- 이 대학의 작년 수시 원서접수 시작 시각(그 대학의 최초 스냅샷 타임스탬프).
  start_at timestamptz not null,
  -- 시간 순 [경과분(분, 최종 집계는 null), 지원인원, 경쟁률] 튜플의 배열.
  series jsonb not null,
  created_at timestamptz not null default now()
);

create index admission_competition_history_lookup_idx
  on public.admission_competition_history (university, department, admission_type);
create index admission_competition_history_summary_idx
  on public.admission_competition_history (university, admission_type)
  where department is null;

alter table public.admission_competition_history enable row level security;

create policy "admission_competition_history select" on public.admission_competition_history
  for select using (auth.uid() is not null);

create policy "admission_competition_history write" on public.admission_competition_history
  for all using (public.has_admin_capabilities()) with check (public.has_admin_capabilities());
