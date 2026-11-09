set search_path = public, extensions;

-- 접수한 원서의 발표 결과를 단계별로 기록한다. 빈 값(null)은 "아직 발표 전"이다.
--   stage1_result     : 1단계 결과 (단계별 전형만)
--   first_result      : 최초 발표 결과
--   waitlist_number   : 최초 발표에서 받은 예비 번호 (대교협 최초후보순위)
--   waitlist_progress : 충원 진행 중 예비 순위 메모 (예: "11 → 4"), 학생이 자유롭게 적는다
--   waitlist_final    : 예비를 거친 경우의 최종 결과
-- 최종 결과는 따로 저장하지 않는다. 1단계 불합격·최초 합격·최초 불합격이면 그 값이 곧
-- 최종 결과이고, 예비였다면 waitlist_final이 최종 결과다. 예전 status 칸은 화면에서
-- 쓰지 않지만 교사용 현황 함수가 아직 읽고 있어 칸은 그대로 둔다.
alter table public.wonseo_cards
  add column stage1_result text check (stage1_result in ('합격', '불합격')),
  add column first_result text check (first_result in ('합격', '예비', '불합격')),
  add column waitlist_number integer check (waitlist_number >= 1),
  add column waitlist_progress text,
  add column waitlist_final text check (waitlist_final in ('합격', '불합격')),
  -- 앞 단계와 맞지 않는 뒤 단계 값(예: 1단계 불합격인데 최초 발표 결과, 최초 합격인데 예비 번호)을 막는다.
  add constraint wonseo_cards_result_stages_consistent check (
    (stage1_result is distinct from '불합격' or first_result is null)
    and (
      coalesce(first_result, '') = '예비'
      or (waitlist_number is null and waitlist_progress is null and waitlist_final is null)
    )
  );
