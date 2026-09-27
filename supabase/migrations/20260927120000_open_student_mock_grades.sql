set search_path = public, extensions;

-- 모의고사 등급을 관리자 테스트에서 정식 기능으로 연다: 학생 본인·담임·관리자가 읽고 쓴다
-- (wonseo_cards와 같은 규칙). 관리자 모드의 담임 겸 관리자는 학년 현황용으로 전체를 본다.
drop policy if exists "mock grades admin" on public.student_mock_grades;

create policy "mock grades access" on public.student_mock_grades
  for all using (
    public.has_admin_capabilities()
    or public.is_homeroom_for(substring(student_id from 1 for 1)::smallint, substring(student_id from 3 for 1)::smallint)
    or student_id = public.current_student_id()
  )
  with check (
    public.has_admin_capabilities()
    or public.is_homeroom_for(substring(student_id from 1 for 1)::smallint, substring(student_id from 3 for 1)::smallint)
    or student_id = public.current_student_id()
  );
