-- 유사 사례가 부족할 때 쓰는 경쟁률 근사 보정표. 원본 입결 업로드가 끝날 때 함께
-- 계산해 저장하므로, 학생·교사 화면에서 원본 수만 건을 다시 훑을 필요가 없다.
alter table public.admission_cut_models
  add column competition_correction jsonb not null default '[]'::jsonb;
