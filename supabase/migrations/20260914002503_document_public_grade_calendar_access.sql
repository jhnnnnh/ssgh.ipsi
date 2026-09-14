set search_path = public, extensions;

-- 학년 공통 일정의 공개 범위를 명시하기 위해, 기존 동작은 바꾸지 않고 함수 본문에
-- 의도와 안전 경계를 남긴다. 이 함수는 calendar_events RLS 정책에서만 사용한다.
CREATE OR REPLACE FUNCTION public.calendar_events_can_view(
  p_type text,
  p_student_id text,
  p_grade smallint,
  p_class_no smallint,
  p_created_by uuid
)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  select case p_type
    when 'wonseo_schedule' then
      p_created_by = auth.uid()
    when 'personal' then
      p_created_by = auth.uid()
    when 'class' then
      public.is_admin()
      or public.is_homeroom_for(p_grade, p_class_no)
      or (public.current_student_grade() = p_grade and public.current_student_class_no() = p_class_no)
    when 'grade' then
      -- 의도된 공개 설정입니다. 학년 공통 일정은 수능일·원서접수 마감일 등
      -- 학사 일정만 담기며, 학생 개인정보(학번·이름·상담내용)가 들어가지 않습니다.
      -- 반 일정(class)과 개인 일정(personal)은 반드시 로그인·소속·작성자 검사를
      -- 유지해야 합니다. 이 분기를 다른 일정 유형에 복사하지 마세요.
      true
    else false
  end;
$function$;
