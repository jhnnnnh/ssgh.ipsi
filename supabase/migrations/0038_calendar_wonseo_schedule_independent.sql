set search_path = public, extensions;

-- 학생이 "내 원서 일정"에서 캘린더에 추가한 일정이 교사에게(또는 그 반대로) 보이면 안 된다는
-- 요청 반영: wonseo_schedule 이벤트를 personal 이벤트와 같은 규칙(만든 사람 본인만
-- 보고/관리)으로 바꾼다. 두 화면(교사/학생)이 서로 완전히 독립적으로 추가·삭제하게 된다.
-- wonseo_linked 분기는 0036에서 이미 이 type 자체가 불가능해졌으므로(체크 제약) 함께 정리한다.
CREATE OR REPLACE FUNCTION public.calendar_events_can_view(p_type text, p_student_id text, p_grade smallint, p_class_no smallint, p_created_by uuid)
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
      true
    else false
  end;
$function$;

CREATE OR REPLACE FUNCTION public.calendar_events_can_manage(p_type text, p_student_id text, p_grade smallint, p_class_no smallint, p_created_by uuid)
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
      public.is_admin() or public.is_homeroom_for(p_grade, p_class_no)
    when 'grade' then
      public.is_admin()
    else false
  end;
$function$;
