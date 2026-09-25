/**
 * 학생·교사가 고를 수 있는 웹폰트 8종. 화면 표시 순서와 동일한 순서로 정의한다.
 * `key`는 DB(profiles.font_family)에 저장되는 값이고, `cssFamily`는 실제
 * font-family CSS 값(항상 "해당 폰트 → Pretendard → sans-serif" 순 폴백)이다.
 * 폰트 파일은 모두 자체 호스팅(globals.css의 @font-face, /public/fonts/*)이다.
 */
export type FontOption = {
  key: string;
  label: string;
  cssFamily: string;
  /**
   * 폰트마다 같은 font-size에서도 실제로 보이는 크기(글자 높이/너비)가 달라서
   * 눈에 보이는 크기를 Pretendard 기준으로 맞추기 위한 보정 배율.
   * 실제 화면 문구 10종 × font-weight 700(앱 UI 대부분이 font-bold라 이 굵기로
   * 측정해야 실제 렌더링과 맞음)으로 Canvas 2D actualBoundingBox를 측정해
   * 표본별 Pretendard 대비 비율의 기하평균을 낸 뒤, 높이 비중 0.65 · 너비 비중
   * 0.35로 가중 평균해 산출했다(사람이 "크기"를 판단할 때 높이 영향이 더 커서).
   */
  sizeAdjust: number;
  /**
   * "글자 굵기" 3단계([얇게, 보통, 굵게])에서 .font-bold에 실제로 적용할 font-weight.
   * 정적 폰트는 실제로 로드한 굵기 파일만 사용하고, 가변 폰트는 지원 범위 안에서 고른다.
   * 지원하지 않는 굵기를 요청하면 브라우저가 synthetic bold를 만들 수 있어서다. 굵기가
   * 1~2종류뿐인 폰트는 단계 몇 개가 같은 값으로 겹친다(그만큼은 조절해도 그대로 보임).
   * [1]번째 값(보통)은 이 기능이 생기기 전 기본 동작과 항상 같다.
   */
  boldWeights: readonly [number, number, number];
};

export const DEFAULT_FONT_KEY = "pretendard";

export const FONT_OPTIONS: FontOption[] = [
  {
    key: "pretendard",
    label: "Pretendard (기본값)",
    cssFamily: "'Pretendard', sans-serif",
    sizeAdjust: 1,
    boldWeights: [700, 800, 900],
  },
  {
    key: "nanum-square",
    label: "나눔스퀘어 네오",
    cssFamily: "'NanumSquareNeo', 'Pretendard', sans-serif",
    sizeAdjust: 0.954,
    boldWeights: [500, 700, 900],
  },
  {
    key: "gyeonggi-cheonnyeon-batang",
    label: "경기천년바탕",
    cssFamily: "'GyeonggiCheonnyeonBatang', 'Pretendard', sans-serif",
    sizeAdjust: 0.927,
    boldWeights: [700, 700, 700],
  },
  {
    key: "moneygraphy",
    label: "머니그라피",
    cssFamily: "'Moneygraphy', 'Pretendard', sans-serif",
    sizeAdjust: 0.955,
    boldWeights: [700, 700, 700],
  },
  {
    key: "gmarket-sans",
    label: "G마켓 산스",
    cssFamily: "'GmarketSans', 'Pretendard', sans-serif",
    sizeAdjust: 0.965,
    boldWeights: [500, 700, 700],
  },
  {
    key: "joseon-gungseo",
    label: "조선 궁서체",
    cssFamily: "'JoseonGungseo', 'Pretendard', sans-serif",
    sizeAdjust: 0.923,
    boldWeights: [700, 700, 700],
  },
  {
    key: "sd-unicef-dodam",
    label: "SD 유니세프 도담체",
    cssFamily: "'SDUnicefDodam', 'Pretendard', sans-serif",
    sizeAdjust: 1.111,
    boldWeights: [700, 700, 700],
  },
  {
    key: "lee-seoyoon",
    label: "이서윤체",
    cssFamily: "'LeeSeoyoon', 'Pretendard', sans-serif",
    sizeAdjust: 1.1,
    boldWeights: [700, 700, 700],
  },
];

/** 설정 화면의 선택 목록. 모든 글꼴이 선택 가능하므로 FONT_OPTIONS와 같다. */
export const FONT_PICKER_OPTIONS: FontOption[] = FONT_OPTIONS;

export function getFontOptionByKey(key: string | null | undefined): FontOption {
  return FONT_OPTIONS.find((f) => f.key === key) ?? FONT_OPTIONS[0];
}

export function getFontFamilyByKey(key: string | null | undefined): string {
  return getFontOptionByKey(key).cssFamily;
}

export function getFontSizeAdjustByKey(key: string | null | undefined): number {
  return getFontOptionByKey(key).sizeAdjust;
}

/**
 * 폰트 종류와 별개로 글자 크기만 조절하는 5단계. 한 단계당 7%씩 바뀐다
 * (전체 범위 -2~+2단계 = 약 87.3%~114.5%).
 */
export const FONT_SIZE_LEVELS = [-2, -1, 0, 1, 2] as const;
export type FontSizeLevel = (typeof FONT_SIZE_LEVELS)[number];
export const DEFAULT_FONT_SIZE_LEVEL: FontSizeLevel = 0;

const FONT_SIZE_STEP = 1.07;

export function getFontSizeMultiplierByLevel(level: number | null | undefined): number {
  const clamped = Math.min(2, Math.max(-2, level ?? 0));
  return FONT_SIZE_STEP ** clamped;
}

/** 폰트 종류와 별개로 글자 굵기(.font-bold)만 조절하는 3단계(얇게/보통/굵게). */
export const FONT_WEIGHT_LEVELS = [-1, 0, 1] as const;
export type FontWeightLevel = (typeof FONT_WEIGHT_LEVELS)[number];
export const DEFAULT_FONT_WEIGHT_LEVEL: FontWeightLevel = 0;

export function getFontBoldWeightByKey(
  key: string | null | undefined,
  level: number | null | undefined,
): number {
  const clamped = Math.min(1, Math.max(-1, level ?? 0));
  return getFontOptionByKey(key).boldWeights[clamped + 1];
}
