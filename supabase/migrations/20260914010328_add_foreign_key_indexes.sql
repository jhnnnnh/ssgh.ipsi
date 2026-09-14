-- 저장 목록·캘린더·첨부 이미지에서 다른 레코드를 참조하는 열에 인덱스를 둔다.
-- 외래키 대상 행을 삭제하거나, 작성자·학생 기준으로 저장 목록을 찾을 때 전체 표를
-- 처음부터 훑지 않도록 해 데이터가 늘어도 응답 속도를 안정적으로 유지한다.

create index if not exists admission_competition_saves_created_by_idx
  on public.admission_competition_saves (created_by);

create index if not exists admission_competition_saves_student_id_idx
  on public.admission_competition_saves (student_id);

create index if not exists admission_probability_saves_created_by_idx
  on public.admission_probability_saves (created_by);

create index if not exists admission_probability_saves_student_id_idx
  on public.admission_probability_saves (student_id);

create index if not exists calendar_events_created_by_idx
  on public.calendar_events (created_by);

create index if not exists wonseo_images_card_id_idx
  on public.wonseo_images (card_id);
