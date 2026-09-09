export type UserRole = "student" | "teacher";

export type TeacherRole = "homeroom" | "admin";

export type SupportLevel = "상향" | "소신" | "적정" | "하향";

/** 전형 유형: 자유 텍스트 (빠른 선택 버튼 + "직접입력"으로 임의 문자열 허용) */
export type ApplicationCategory = string;

export type ApplicationStatus =
  | "지원예정"
  | "원서접수"
  | "1차합격"
  | "최종합격"
  | "예비번호"
  | "불합격";

export type SelectionMode = "single" | "multi";

export type FavoriteCategory = "weekday" | "weekend";

export type Roster = {
  student_id: string;
  name: string;
  grade: number;
  class_no: number;
  /** 이 학생의 원서 카드 목록에서 지망 순위를 드래그 순서로 자동 계산할지(켜짐, 기본값)
   *  각 카드마다 직접 텍스트로 입력할지(꺼짐)를 결정한다. */
  rank_auto_assign: boolean;
  created_at: string;
};

export type Profile = {
  id: string;
  role: UserRole;
  student_id: string | null;
  name: string | null;
  theme_color: string | null;
  font_family: string | null;
  /** 폰트 종류와 별개로 글자 크기만 조절하는 5단계(-2~+2, 0=보통) 값. */
  font_size_level: number;
  /** 폰트 종류와 별개로 글자 굵기(font-bold)만 조절하는 3단계(-1~+1, 0=보통) 값. */
  font_weight_level: number;
  teacher_role: TeacherRole | null;
  grade: number | null;
  class_no: number | null;
  dual_admin: boolean;
  admin_mode_enabled: boolean;
  /** "합격 확률 추정" 기능의 유의사항에 동의한 시각(null이면 아직 동의 전 — 기능 사용 전
   * 반드시 유의사항을 끝까지 읽고 동의해야 한다). */
  admission_probability_consent_at: string | null;
  created_at: string;
};

export type CounselingSlot = {
  id: string;
  date: string;
  start_time: string;
  end_time: string;
  is_booked: boolean;
  student_id: string | null;
  student_name: string | null;
  booked_at: string | null;
  memo: string | null;
  grade: number;
  class_no: number;
  created_at: string;
};

export type SlotFavorite = {
  id: string;
  category: FavoriteCategory;
  start_time: string;
  end_time: string;
  grade: number;
  class_no: number;
  created_at: string;
};

export type WonseoCard = {
  id: string;
  student_id: string;
  rank: string | null;
  level: SupportLevel;
  status: ApplicationStatus;
  university: string | null;
  department: string | null;
  enrollment: number | null;
  category: ApplicationCategory;
  sub_category: string | null;
  selection_mode: SelectionMode;
  stage_single: string | null;
  stage_1: string | null;
  stage_2: string | null;
  calculated_grade: string | null;
  min_standard: string | null;
  memo: string | null;
  recent_results: RecentResultYear[];
  sort_order: number;
  /** 실제로 원서를 접수한 카드인지(별표). true인 카드만 "접수한 원서" 화면에 모아 보여준다. */
  is_submitted: boolean;
  /** 접수 후 발급된 수험번호. "접수한 원서" 화면에서만 입력한다. */
  application_number: string | null;
  /** "접수한 원서" 화면에서 자유롭게 추가하는 일정(논술/면접/실기, 1차 발표 등). */
  schedule_events: ScheduleEvent[];
  /** "접수한 원서" 화면 전용 정렬 순서. sort_order(접수 전 화면)와 완전히 분리되어 있어,
   * 한쪽 화면에서 드래그로 순서를 바꿔도 다른 화면의 카드 순서에 영향을 주지 않는다. */
  submitted_sort_order: number;
  created_at: string;
  updated_at: string;
};

/** schedule_events 배열의 한 항목. */
export type ScheduleEvent = {
  label: string;
  /** "YYYY-MM-DD" 또는 미정이면 빈 문자열. */
  date: string;
};

/** 최근 입결 표의 한 연도 열. 모든 값은 대학마다 표기 형식이 달라 자유 텍스트로 둔다. */
export type RecentResultYear = {
  year: string;
  enrollment: string;
  competitionRate: string;
  fillCount: string;
  cut50: string;
  cut70: string;
  myPosition: string;
};

export type WonseoImage = {
  id: string;
  card_id: string;
  student_id: string;
  storage_path: string;
  created_at: string;
};

export type AppSettings = {
  key: string;
  value: Record<string, unknown>;
};

/**
 * "대학어디가" 형식 엑셀의 대학자료 시트를 그대로 저장한 입결 데이터.
 * 매년 전체관리자가 새 파일을 올리면 통째로 교체된다.
 */
export type AdmissionCutoff = {
  id: string;
  region: string | null;
  university: string;
  year: number;
  admission_period: string | null;
  track: string | null;
  admission_type: string | null;
  department: string;
  humanities_science: string | null;
  enrollment: string | null;
  competition_rate: string | null;
  additional_pass: string | null;
  converted_50: string | null;
  converted_70: string | null;
  max_score: string | null;
  grade_50: string | null;
  grade_70: string | null;
  korean: string | null;
  math: string | null;
  inquiry: string | null;
  average: string | null;
  english: string | null;
  total_applicants: string | null;
  passers: string | null;
  actual_competition_rate: string | null;
  admission_department: string | null;
  sub_category: string | null;
  created_at: string;
};

/**
 * 이투스 "OOOO학년도 수시전형모음" 엑셀의 "전형데이터" 시트(93열)를 저장한 전형정보.
 * 매년 전체관리자가 새 파일을 올리면 식별 CODE 기준으로 안전하게 교체된다. 실제로
 * 매칭·자동 채움에 쓰는 필드만 타입 있는 컬럼이고, 나머지 원본 열은 raw에 통째로 있다.
 */
export type AdmissionOffering = {
  id: string;
  offering_code: string;
  university: string;
  department: string;
  admission_type: string;
  admission_type_group: string | null;
  track: string;
  plan_kind: string | null;
  field: string | null;
  field_detail: string | null;
  enrollment: number | null;
  selection_model: string;
  method_text: string | null;
  method_academic_quant: number | null;
  method_academic_qual: number | null;
  method_interview: number | null;
  method_essay: number | null;
  method_practical: number | null;
  method_document: number | null;
  method_stage1_score: number | null;
  method_etc: number | null;
  min_standard_applied: string | null;
  min_standard_text: string | null;
  raw: Record<string, unknown>;
  uploaded_at: string;
  created_at: string;
};

export type CalendarEventType = "wonseo_schedule" | "personal" | "class" | "grade";

/**
 * 입시 일정 캘린더 이벤트. wonseo_schedule은 "접수한 원서" 카드에 등록해 둔 일정(schedule_events)
 * 중 캘린더에 추가한 건을 title/date/kind로 스냅샷 저장한다 — 카드 하나에 여러 건이 있을 수 있다.
 */
export type CalendarEvent = {
  id: string;
  type: CalendarEventType;
  title: string | null;
  date: string | null;
  /** wonseo_schedule 전용: schedule_events 배열 안 위치로 만든 안정적인 키. */
  kind: string | null;
  color: string;
  student_id: string | null;
  grade: number | null;
  class_no: number | null;
  wonseo_card_id: string | null;
  created_by: string;
  created_at: string;
  updated_at: string;
};

type NoRelationships = { Relationships: [] };

export type Database = {
  public: {
    Tables: {
      roster: {
        Row: Roster;
        Insert: Pick<Roster, "student_id" | "name"> & Partial<Pick<Roster, "created_at">>;
        Update: Partial<Omit<Roster, "grade" | "class_no">>;
      } & NoRelationships;
      profiles: {
        Row: Profile;
        Insert: Pick<Profile, "id" | "role"> &
          Partial<
            Pick<
              Profile,
              | "student_id"
              | "name"
              | "theme_color"
              | "font_family"
              | "font_size_level"
              | "font_weight_level"
              | "teacher_role"
              | "grade"
              | "class_no"
              | "created_at"
            >
          >;
        Update: Partial<Profile>;
      } & NoRelationships;
      counseling_slots: {
        Row: CounselingSlot;
        Insert: Pick<CounselingSlot, "date" | "start_time" | "end_time" | "grade" | "class_no"> &
          Partial<
            Pick<
              CounselingSlot,
              | "id"
              | "is_booked"
              | "student_id"
              | "student_name"
              | "booked_at"
              | "memo"
              | "created_at"
            >
          >;
        Update: Partial<CounselingSlot>;
      } & NoRelationships;
      slot_favorites: {
        Row: SlotFavorite;
        Insert: Pick<SlotFavorite, "category" | "start_time" | "end_time" | "grade" | "class_no"> &
          Partial<Pick<SlotFavorite, "id" | "created_at">>;
        Update: Partial<SlotFavorite>;
      } & NoRelationships;
      wonseo_cards: {
        Row: WonseoCard;
        Insert: Pick<WonseoCard, "student_id" | "university"> &
          Partial<Omit<WonseoCard, "student_id" | "university" | "id">> & { id?: string };
        Update: Partial<WonseoCard>;
      } & NoRelationships;
      wonseo_images: {
        Row: WonseoImage;
        Insert: Pick<WonseoImage, "card_id" | "student_id" | "storage_path"> &
          Partial<Pick<WonseoImage, "id" | "created_at">>;
        Update: Partial<WonseoImage>;
      } & NoRelationships;
      app_settings: {
        Row: AppSettings;
        Insert: AppSettings;
        Update: Partial<AppSettings>;
      } & NoRelationships;
      calendar_events: {
        Row: CalendarEvent;
        Insert: Pick<CalendarEvent, "type" | "color" | "created_by"> &
          Partial<Omit<CalendarEvent, "type" | "color" | "created_by" | "id">> & { id?: string };
        Update: Partial<CalendarEvent>;
      } & NoRelationships;
      admission_cutoffs: {
        Row: AdmissionCutoff;
        Insert: Pick<AdmissionCutoff, "university" | "year" | "department"> &
          Partial<Omit<AdmissionCutoff, "university" | "year" | "department" | "id">> & { id?: string };
        Update: Partial<AdmissionCutoff>;
      } & NoRelationships;
      admission_offerings: {
        Row: AdmissionOffering;
        Insert: Pick<
          AdmissionOffering,
          "offering_code" | "university" | "department" | "admission_type" | "track" | "selection_model" | "raw" | "uploaded_at"
        > &
          Partial<
            Omit<
              AdmissionOffering,
              "offering_code" | "university" | "department" | "admission_type" | "track" | "selection_model" | "raw" | "uploaded_at" | "id"
            >
          > & { id?: string };
        Update: Partial<AdmissionOffering>;
      } & NoRelationships;
    };
    Views: Record<string, never>;
    Functions: {
      book_slot: {
        Args: { p_slot_id: string };
        Returns: CounselingSlot;
      };
      cancel_slot: {
        Args: { p_slot_id: string };
        Returns: CounselingSlot;
      };
      current_student_grade: {
        Args: Record<string, never>;
        Returns: number | null;
      };
      current_student_class_no: {
        Args: Record<string, never>;
        Returns: number | null;
      };
      search_admission_cutoff_candidates: {
        Args: { p_university: string; p_department: string; p_limit?: number };
        Returns: { university: string; department: string; score: number }[];
      };
      autocomplete_cutoff_universities: {
        Args: { p_query: string; p_limit?: number };
        Returns: { university: string }[];
      };
      autocomplete_cutoff_departments: {
        Args: { p_query: string; p_university?: string | null; p_limit?: number };
        Returns: { university: string; department: string }[];
      };
      autocomplete_cutoff_admission_types: {
        Args: {
          p_query: string;
          p_university?: string | null;
          p_department?: string | null;
          p_limit?: number;
        };
        Returns: { admission_type: string; department: string; track: string | null }[];
      };
      autocomplete_competition_universities: {
        Args: { p_query?: string; p_limit?: number };
        Returns: { university: string }[];
      };
      autocomplete_competition_departments: {
        Args: { p_university: string; p_limit?: number };
        Returns: { department: string }[];
      };
      autocomplete_competition_has_summary: {
        Args: { p_university: string };
        Returns: boolean;
      };
      autocomplete_competition_admission_types: {
        Args: { p_university: string; p_department?: string | null };
        Returns: { admission_type: string }[];
      };
      autocomplete_offering_universities: {
        Args: { p_query: string; p_limit?: number };
        Returns: { university: string }[];
      };
      autocomplete_offering_departments: {
        Args: { p_query: string; p_university?: string | null; p_limit?: number };
        Returns: { university: string; department: string }[];
      };
      autocomplete_offering_admission_types: {
        Args: {
          p_query: string;
          p_university?: string | null;
          p_department?: string | null;
          p_track?: string | null;
          p_limit?: number;
        };
        Returns: { admission_type: string; department: string; track: string }[];
      };
    };
  };
};
