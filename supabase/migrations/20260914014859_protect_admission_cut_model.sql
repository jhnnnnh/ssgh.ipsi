-- 계산 자료는 로그인 확인을 거친 서버 API만 반환한다. 브라우저의 Data API에서
-- 직접 읽거나 바꾸는 경로는 명시적으로 막는다(서비스 역할은 RLS를 우회).
create policy "admission_cut_models no direct access"
  on public.admission_cut_models
  for all
  using (false)
  with check (false);
