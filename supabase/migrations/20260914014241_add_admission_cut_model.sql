-- 합격 가능성 계산기는 입결 원본을 매 요청마다 훑지 않고, 입결 업로드가 끝난 시점에
-- 만들어 둔 계산용 숫자 목록 한 건만 읽는다. 이 목록은 공개 입시 통계에서 계산한 값이며,
-- 학생 개인정보나 원본 입결의 전체 열은 포함하지 않는다.
create table public.admission_cut_models (
  id text primary key check (id = 'current'),
  database jsonb not null,
  bins jsonb not null,
  source_row_count integer not null,
  source_years smallint[] not null,
  built_at timestamptz not null default now()
);

alter table public.admission_cut_models enable row level security;

-- 이 테이블은 브라우저에서 직접 읽지 않는다. 로그인 확인을 거친 서버 API와 관리자
-- 업로드 API만 서비스 역할로 접근한다.
