set search_path = public, extensions;

-- 모의고사 등급은 관리자 모드 테스트 기능으로만 쓴다. 직전 마이그레이션에서 넓힌 권한을
-- 관리자 전용으로 되돌린다.
drop policy if exists "mock grades access" on public.student_mock_grades;

create policy "mock grades admin" on public.student_mock_grades
  for all using (public.has_admin_capabilities()) with check (public.has_admin_capabilities());
