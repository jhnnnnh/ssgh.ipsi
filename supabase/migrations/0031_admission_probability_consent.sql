set search_path = public, extensions;

-- "합격 확률 추정" 기능은 통계적 근사치를 구체적인 퍼센트로 보여주는, 오해 소지가 큰
-- 기능이라 처음 쓸 때 유의사항을 끝까지 읽고 동의해야만 이후 조회가 가능하다. 동의
-- 시각을 계정(profiles)에 남겨서 기기를 바꿔도 다시 동의를 요구하지 않는다.
alter table public.profiles
  add column admission_probability_consent_at timestamptz;
