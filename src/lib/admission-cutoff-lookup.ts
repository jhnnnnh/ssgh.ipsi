import { createClient } from "@/lib/supabase/client";
import { emptyResultYear } from "@/components/wonseo/RecentResultsTable";
import type { RecentResultYear } from "@/lib/database.types";

export type CutoffMatch = {
  year: number;
  enrollment: string | null;
  competition_rate: string | null;
  additional_pass: string | null;
  grade_50: string | null;
  grade_70: string | null;
};

type CutoffRow = CutoffMatch & { track: string | null; admission_type: string | null };

const RECENT_YEARS = 3;

/** 대학교명 + 모집단위가 정확히 일치하는 입결 원본 행을 전부 가져온다(연도별로 안 묶은 상태). */
async function fetchCutoffRows(university: string, department: string): Promise<CutoffRow[]> {
  const supabase = createClient();
  const { data } = await supabase
    .from("admission_cutoffs")
    .select("year, track, admission_type, enrollment, competition_rate, additional_pass, grade_50, grade_70")
    .eq("university", university)
    .eq("department", department)
    .eq("admission_period", "수시")
    .order("year", { ascending: false })
    .order("admission_type", { ascending: true });
  return data ?? [];
}

/** wonseo 카드의 전형 유형 문자열을 admission_cutoffs.track 값으로 변환한다(추천 표시용). */
export function trackFromCategory(category: string): "교과" | "종합" | undefined {
  if (category.includes("교과")) return "교과";
  if (category.includes("종합")) return "종합";
  return undefined;
}

/** 학생이 전형을 직접 고른 뒤, 그 전형의 최근 3개년 입결만 가져온다. */
export async function fetchCutoffsForType(
  university: string,
  department: string,
  admissionType: string,
): Promise<CutoffMatch[]> {
  const rows = await fetchCutoffRows(university, department);
  return rows
    .filter((r) => r.admission_type === admissionType)
    .sort((a, b) => b.year - a.year)
    .slice(0, RECENT_YEARS);
}

export type CutoffLookupGroup = {
  admissionType: string;
  track: string | null;
  /** 그 전형으로 찾은 모든 연도(있는 만큼, 최대 2023~2026학년도), 최신순. */
  years: CutoffMatch[];
};

/**
 * "입결 조회" 탭 전용 — 대학+학과로 admission_cutoffs 원본을 통째로 찾아 세부전형명별로
 * 묶는다(연도 3개로 자르지 않고 있는 연도를 전부 보여준다). admissionType을 주면 그
 * 전형 하나만 남긴다.
 */
export async function searchCutoffsForLookup(
  university: string,
  department: string,
  admissionType?: string,
): Promise<CutoffLookupGroup[]> {
  const rows = await fetchCutoffRows(university, department);
  const byType = new Map<string, CutoffRow[]>();
  for (const row of rows) {
    if (!row.admission_type) continue;
    if (admissionType && row.admission_type !== admissionType) continue;
    const list = byType.get(row.admission_type) ?? [];
    list.push(row);
    byType.set(row.admission_type, list);
  }
  return [...byType.entries()].map(([type, typeRows]) => ({
    admissionType: type,
    track: typeRows[0]?.track ?? null,
    years: [...typeRows].sort((a, b) => b.year - a.year),
  }));
}

/**
 * 이름을 비교하기 좋게 다듬는다. "교과"/"종합"/"전형"은 트랙을 나타내는 수식어일 뿐
 * 전형을 구분하는 진짜 이름이 아닌데, 두 원본이 이 수식어를 서로 다른 위치에 넣는다
 * (입결 쪽 "교과(지역인재)" vs 전형데이터 쪽 "지역인재전형(교과)") — 그대로 비교하면
 * 같은 전형인데도 문자열이 안 겹쳐서 다르다고 오판할 수 있어 미리 걷어낸다.
 */
export function normalize(s: string): string {
  return s
    .replace(/\s+/g, "")
    .replace(/전형|교과|종합|\(|\)/g, "")
    .trim();
}

/** 이름이 완전히 같으면 2점, 한쪽이 다른 쪽을 포함하면 1점, 전혀 안 비슷하면 0점. */
export function nameSimilarity(a: string, b: string): number {
  if (!a || !b) return 0;
  if (a === b) return 2;
  // 너무 짧은 조각끼리의 포함 관계는 우연히 겹칠 수 있어 후보로 인정하지 않는다.
  if (Math.min(a.length, b.length) < 2) return 0;
  if (a.includes(b) || b.includes(a)) return 1;
  return 0;
}

/** normalize()와 달리 "교과"/"종합"은 남겨 두고 "전형"과 괄호·공백만 걷어낸다.
 * normalize()가 "교과"/"종합"까지 지우는 건 서로 다른 원본(입결 vs 전형데이터)이 그
 * 수식어를 다른 위치에 적는 문제를 풀기 위해서였는데, 전형 트랙(교과/종합) 자체를 맞춰야
 * 하는 비교에 그대로 쓰면 "학생부종합"과 "교과(학생부교과)"가 둘 다 "학생부"로 뭉개져서
 * 완전히 다른 트랙인데도 "똑같다"고 오판한다(실제로 카드에 학생부종합으로 적었는데
 * 학생부교과 입결이 잘못 채워지는 사고가 있었다). */
export function normalizeKeepingTrack(s: string): string {
  return s
    .replace(/\s+/g, "")
    .replace(/전형|[()]/g, "")
    .trim();
}

/** 전형명을 "트랙"과 "핵심 이름"으로 나눈다. 입결 쪽은 "교과(지역인재)"처럼 트랙을 앞에,
 * 전형데이터 쪽은 "지역인재전형(교과)"처럼 트랙을 뒤에 적는 등 같은 전형도 두 원본이 트랙
 * 수식어를 서로 다른 위치에 넣어서, 문자열을 그대로 이어 붙여 비교하면(normalizeKeepingTrack
 * 처럼) 순서가 달라 안 겹친다고 오판할 수 있다. 트랙과 핵심 이름을 분리해서 트랙은
 * 트랙끼리, 핵심 이름은 핵심 이름끼리 비교하면 위치와 무관하게 맞는다.
 *
 * 트랙은 "교과"/"종합"뿐 아니라 "논술"/"실기·실적"까지 인식한다 — 이 두 트랙 단어가
 * 빠져 있으면(둘 다 트랙 표기가 없다고 보고) 트랙 검사를 건너뛰어서, 예를 들어
 * "교과(지역인재)"가 완전히 다른 트랙인 "지역인재전형(논술)"과도 핵심 이름("지역인재")만
 * 겹친다는 이유로 잘못 같은 전형으로 묶이는 사고가 실제로 있었다. */
function parseTrackAndCore(s: string): { track: string | null; core: string } {
  const track = s.includes("논술")
    ? "논술"
    : s.includes("실기") || s.includes("실적")
      ? "실기실적"
      : s.includes("종합")
        ? "종합"
        : s.includes("교과")
          ? "교과"
          : null;
  // "숙명인재-면접"처럼 하이픈·가운뎃점 같은 구분 기호가 섞여 들어간 이름은, 같은
  // 전형인데도 다른 원본은 그 기호 없이 적어 두면("숙명인재면접형") 문자열이 안
  // 겹쳐서 다르다고 오판한다. 괄호뿐 아니라 이런 구분 기호도 같이 지운다. 영문
  // 대소문자도(예: 충북대 "sw우수인재" vs "SW우수인재전형") 소문자로 맞춘다.
  const core = s
    .toLowerCase()
    .replace(/\s+/g, "")
    .replace(/전형|교과|종합|논술|실기|실적|[()\-·/_]/g, "")
    .trim();
  return { track, core };
}

/** 문자열 비교 알고리즘만으로는 절대 판정할 수 없어서(예: 세종대 "창의인재"와 "세종인재"처럼
 * 아예 다른 이름을 쓰는 경우) 사람이 직접 두 데이터를 대조해 "같은 전형"이라고 확인한
 * 표기 쌍이다. 이 목록에 있는 쌍만 예외로 인정하고, 일반 규칙 자체를 느슨하게 만들지는
 * 않는다 — 그러면 진짜 다른 전형(예: 을지대 "지역의료-특별", 영남대 "지역-의약학")까지
 * 잘못 묶일 위험이 커진다. */
const CONFIRMED_ADMISSION_TYPE_ALIASES: [string, string][] = [
  ["종합(고교생활Ⅰ)", "고교생활우수자전형Ⅰ"], // 전남대
  ["종합(학교생활-면접)", "학교생활우수자(면접)전형"], // 동의대
  ["종합(CAU탐구형)", "탐구형인재전형"], // 중앙대
  ["종합(CAU융합형)", "융합형인재전형"], // 중앙대
  ["교과(지역의료-일반)", "지역의료인재전형(일반형)"], // 을지대
  ["종합(창의인재-면접)", "세종인재전형(면접형)"], // 세종대
  ["종합(창의인재-서류)", "세종인재전형(서류형)"], // 세종대
];

function isConfirmedAdmissionTypeAlias(a: string, b: string): boolean {
  return CONFIRMED_ADMISSION_TYPE_ALIASES.some(([x, y]) => (x === a && y === b) || (x === b && y === a));
}

/** 전형명 전용 유사도. 사람이 확인한 예외 쌍이면 무조건 같다고 보고, 아니면 트랙(교과/종합)이
 * 서로 다를 때(둘 다 트랙 표기가 있는데 다르면) 무조건 다른 전형으로 보고, 트랙이 같거나
 * 한쪽에만 트랙 표기가 있으면 핵심 이름(트랙·"전형"·괄호를 뺀 나머지)을 nameSimilarity로
 * 비교한다. matchesHint(검색 결과 필터)와 입결 자동 채움에서 공통으로 쓴다. */
export function admissionTypeSimilarity(a: string, b: string): number {
  if (isConfirmedAdmissionTypeAlias(a, b)) return 2;
  const pa = parseTrackAndCore(a);
  const pb = parseTrackAndCore(b);
  if (pa.track && pb.track && pa.track !== pb.track) return 0;
  return nameSimilarity(pa.core, pb.core);
}

/** pickBestFuzzyOption과 같은 역할이지만 전형명 전용으로, admissionTypeSimilarity를 써서
 * 트랙이 다르면 절대 안 고르고 트랙 표기 위치가 달라도 같은 전형을 알아본다. */
export function pickBestFuzzyAdmissionType(options: string[], hint: string): string | null {
  if (!hint.trim()) return null;
  const hintCore = parseTrackAndCore(hint).core;
  let best: { value: string; score: number; coreLenDiff: number } | null = null;
  for (const o of options) {
    const score = admissionTypeSimilarity(o, hint);
    if (score === 0) continue;
    const coreLenDiff = Math.abs(parseTrackAndCore(o).core.length - hintCore.length);
    if (!best || score > best.score || (score === best.score && coreLenDiff < best.coreLenDiff)) {
      best = { value: o, score, coreLenDiff };
    }
  }
  return best?.value ?? null;
}

/** 이름이 정확히 같은 후보가 없을 때, 문자열 목록 중 힌트와 이름이 가장 비슷한 하나를
 * 고른다. "내 원서 카드에서 불러오기"처럼 수기로 입력한 학교/학과/전형명이 실제 목록
 * 표기와 정확히 같지 않을 때(예: "경제학과" vs "경제학부(경제학전공)") 각종 선택 팝업의
 * 칸을 미리 채워 넣는 데 쓴다. 전형명 비교이므로 교과/종합 트랙은 절대 뭉개면 안 돼서
 * normalize() 대신 normalizeKeepingTrack()을 쓴다. nameSimilarity는 포함 관계만 보고
 * 0/1/2점으로만 채점하기 때문에(예: "학생부교과" 계열 이름은 서로 다 "학생부교과"를
 * 포함해서) 같은 점수의 후보가 여러 개 나올 수 있다 — 그럴 때는 정규화한 길이가 힌트와
 * 가장 가까운(=군더더기가 가장 적어 진짜 같은 이름일 가능성이 가장 높은) 후보를 고른다. */
export function pickBestFuzzyOption(options: string[], hint: string): string | null {
  const normalizedHint = normalizeKeepingTrack(hint);
  if (!normalizedHint) return null;
  let best: { value: string; score: number; lengthDiff: number } | null = null;
  for (const o of options) {
    const normalizedOption = normalizeKeepingTrack(o);
    const score = nameSimilarity(normalizedOption, normalizedHint);
    if (score === 0) continue;
    const lengthDiff = Math.abs(normalizedOption.length - normalizedHint.length);
    if (!best || score > best.score || (score === best.score && lengthDiff < best.lengthDiff)) {
      best = { value: o, score, lengthDiff };
    }
  }
  return best?.value ?? null;
}

/**
 * 최근 3개년 입결을 조용히, 최대한 자동으로 채운다. 이투스 전형데이터에서 이미 정해진
 * 세부 전형명과 이름이 실제로 비슷한 입결 전형이 있을 때만 채운다 — 두 데이터가 서로 다른
 * 원본이라 표기가 항상 똑같지는 않아서(예: "지역인재" vs "지역인재전형(교과)") 이름 포함
 * 관계까지는 인정하지만, 트랙(교과/종합)만 같다고 무작정 아무 전형이나 골라 쓰지는 않는다 —
 * 그러면 이번에 신설된 전형에 작년 이전 다른 전형의 입결이 잘못 붙어버릴 수 있다. 이름이
 * 비슷한 후보가 하나도 없으면(신설 전형 등) 사용자에게 다시 묻지 않고 그냥 비워 둔다.
 */
export async function fetchRecentResultsBestEffort(
  university: string,
  department: string,
  preferredTrack: "교과" | "종합" | undefined,
  hintAdmissionType: string,
): Promise<CutoffMatch[]> {
  const rows = await fetchCutoffRows(university, department);
  if (rows.length === 0) return [];

  const trackOf = new Map<string, string | null>();
  for (const row of rows) {
    if (row.admission_type && !trackOf.has(row.admission_type)) {
      trackOf.set(row.admission_type, row.track);
    }
  }

  let best: { type: string; score: number; track: string | null } | null = null;
  for (const [type, track] of trackOf) {
    const score = admissionTypeSimilarity(type, hintAdmissionType);
    if (score === 0) continue;
    const better =
      !best ||
      score > best.score ||
      (score === best.score && preferredTrack != null && track === preferredTrack && best.track !== preferredTrack);
    if (better) best = { type, score, track };
  }
  if (!best) return [];

  return fetchCutoffsForType(university, department, best.type);
}

export type CutoffCandidate = {
  university: string;
  department: string;
  score: number;
};

/**
 * 대학명+학과명이 정확히 일치하는 입결이 아예 없을 때(대학이 학과를 개편했거나 표기가
 * 다른 경우) 이름이 비슷한 (대학, 학과) 후보를 찾는다. DB의 트라이그램 유사도로만
 * 거르므로, 진짜 같은 학과의 개편인지는 사람이 최종 확인해야 한다.
 */
export async function searchCutoffCandidates(
  university: string,
  department: string,
): Promise<CutoffCandidate[]> {
  const supabase = createClient();
  const { data } = await supabase.rpc("search_admission_cutoff_candidates", {
    p_university: university,
    p_department: department,
  });
  return data ?? [];
}

export type CutoffCandidatePreview = CutoffCandidate & { years: CutoffMatch[] };

/**
 * 세부 전형명이 "교과"/"종합"처럼 트랙 수식어뿐이라 이름으로는 비교가 안 될 때 쓴다.
 * 후보 학과의 전형 중 트랙이 같은 것 하나를 미리보기용으로 고른다 — 사용자가 후보
 * 목록에서 최종 확인하는 흐름에서만 쓰이므로, 이름 없이 트랙만으로 골라도 안전하다
 * (fetchRecentResultsBestEffort의 조용한 자동 채움 경로는 이 완화된 규칙을 안 쓴다).
 */
async function fetchAnyCutoffForTrack(
  university: string,
  department: string,
  preferredTrack: "교과" | "종합" | undefined,
): Promise<CutoffMatch[]> {
  const rows = await fetchCutoffRows(university, department);
  const trackOf = new Map<string, string | null>();
  for (const row of rows) {
    if (row.admission_type && !trackOf.has(row.admission_type)) trackOf.set(row.admission_type, row.track);
  }
  const preferredMatch = [...trackOf.entries()].find(([, track]) => preferredTrack && track === preferredTrack);
  const chosen = preferredMatch?.[0] ?? [...trackOf.keys()][0];
  if (!chosen) return [];
  return fetchCutoffsForType(university, department, chosen);
}

/**
 * 이름이 비슷한 (대학, 학과) 후보들 중에서, 실제로 세부전형명까지 이름이 비슷한 전형이
 * 있어서 미리보기(최근 3개년)를 만들 수 있는 것만 골라 반환한다(최대 5개) — 후보로
 * 나왔지만 정작 보여줄 데이터가 없는 항목은 걸러낸다. 여기서 나온 값은 원래 카드의
 * 학과와 다른 학과 데이터일 수 있으니 항상 "참고용"으로만 취급해야 한다.
 */
export async function searchCutoffCandidatesWithPreview(
  university: string,
  department: string,
  preferredTrack: "교과" | "종합" | undefined,
  hintAdmissionType: string,
): Promise<CutoffCandidatePreview[]> {
  const candidates = await searchCutoffCandidates(university, department);
  const hasHint = normalize(hintAdmissionType).length > 0;
  const withPreview = await Promise.all(
    candidates.map(async (c) => ({
      ...c,
      years: hasHint
        ? await fetchRecentResultsBestEffort(c.university, c.department, preferredTrack, hintAdmissionType)
        : await fetchAnyCutoffForTrack(c.university, c.department, preferredTrack),
    })),
  );
  return withPreview.filter((c) => c.years.length > 0).slice(0, 5);
}

/**
 * 불러온 입결을 기존 최근 입결 표에 합친다. 같은 연도가 이미 있으면 그 행의
 * 모집인원/경쟁률/충원인원/50%컷/70%컷만 덮어쓰고, "나의 상대적 위치"는 절대 건드리지 않는다.
 */
export function mergeCutoffsIntoYears(
  existing: RecentResultYear[],
  fetched: CutoffMatch[],
): RecentResultYear[] {
  const byYear = new Map(existing.map((y) => [y.year, y]));
  for (const row of fetched) {
    const yearKey = String(row.year);
    const base = byYear.get(yearKey) ?? emptyResultYear(yearKey);
    byYear.set(yearKey, {
      ...base,
      enrollment: row.enrollment ?? base.enrollment,
      competitionRate: row.competition_rate ?? base.competitionRate,
      fillCount: row.additional_pass ?? base.fillCount,
      cut50: row.grade_50 ?? base.cut50,
      cut70: row.grade_70 ?? base.cut70,
    });
  }
  return Array.from(byYear.values()).sort((a, b) => Number(b.year) - Number(a.year));
}
