/**
 * 학생부 교과 합격 가능성 추정 엔진 v3. `합격가능성_계산구조_v3_최종.md` 스펙을 그대로
 * 옮긴 것으로, 계수를 임의로 바꾸지 않는다.
 *
 * 이전 버전(50컷 예측식 → 70컷 예측식 → 마지노선 확장 회귀식 → 로지스틱 확률 변환식을
 * 순서대로 이어붙이던 방식)은 폐기했다. 새 구조는 "비슷한 과거 사례를 찾아 그 실제
 * 결과를 몬테카를로로 세어 확률을 구하는" 하나의 통합 파이프라인이다:
 *
 *  [B] 5차원(수준50/수준70/추세70/정원변화/국소경쟁률) 커널로 비슷한 과거 사례에 가중치를 매김
 *  [C] 그 가중치의 가중중앙값으로 50%컷·70%컷을 화면에 표시
 *  [D] 이 학과 "자신의" 가장 최근해 합격자수(모집인원+충원인원)만으로 마지노선 배수(ratio)를 구함
 *  [E] [B]의 가중치로 과거 (50컷,70컷)을 복원추출 + ratio를 정규분포로 흔들어 마지노선을
 *      몬테카를로 시뮬레이션
 *  [F] 시뮬레이션된 마지노선 중 사용자 성적 이상인 비율 = 합격확률(추가 보정 없음)
 *
 * 비교 대상 DB(model.database)는 학생부 교과전형 데이터로만 만들어져 있다 — 종합전형
 * 학과를 입력해도 계산 자체는 막지 않지만(표에 입력한 값만으로 결과를 낸다), 그 경우
 * 참고하는 유사 사례들이 전부 교과전형이라는 점을 감안해야 한다.
 */

import {
  computeKernelWeights,
  weightedMedian,
  computeAdmitRatio,
  simulateMarginoseon,
  admissionProbabilityFromSimulation,
  RATIO_STD,
  type KernelDatabaseRow,
  type LevelBin,
} from "@/lib/admission-cut-kernel-predictor";

export type EstimatorInput = {
  userScore: number;
  targetQuota: number;
  expectedCompetition: number;
  /** [2026, 2025, 2024] 순서. 값 없는 연도는 0. */
  c50: [number, number, number];
  c70: [number, number, number];
  quota: [number, number, number];
  turnover: [number, number, number];
};

export type KernelModel = {
  database: KernelDatabaseRow[];
  bins: LevelBin[];
};

export type ProbCurvePoint = { grade: number; prob: number };

export type EstimatorResult = {
  p50Predicted: number;
  p70Predicted: number;
  /** 0~100, 점추정치. */
  prob: number;
  /** 0~100, 하한/상한 — 단일 수치보다 이 범위로 표기한다(아래 estimateProbabilityMargin 참고). */
  probLow: number;
  probHigh: number;
  /** [B]단계 유효표본수. 범위 폭 계산에 쓰이며, 화면에 구체적인 숫자로 노출하지는 않는다. */
  effectiveN: number;
  /** 성적(등급)에 따른 합격확률 곡선 — 결과를 시각화할 때 쓴다. */
  curve: ProbCurvePoint[];
};

export type EstimatorOutcome = EstimatorResult | { insufficient: true; reason: string };

function isTripleComplete(t: [number, number, number]): boolean {
  return t.every((v) => v > 0);
}

/**
 * 확률을 단일 수치 대신 범위로 보여주기 위한 폭(±%p) 계산. 가중치를 쓴 추정값의 표준오차는
 * 통계학에서 흔히 "유효표본수"(Kish's effective sample size — 이미 [B]단계에서 계산해 둔
 * effectiveN)로 근사한다: SE ≈ √(p(1-p) / 유효표본수). 참고할 수 있는 비슷한 사례가
 * 많을수록(유효표본수가 클수록) 범위는 좁아지고, 적을수록 넓어진다. 다만 이 폭이 너무 좁으면
 * (과도한 확신) 실제보다 정밀해 보이고, 너무 넓으면(수치 자체가 무의미) 정보로서 가치가
 * 없어지므로 3~20%p 사이로 제한한다.
 */
function estimateProbabilityMargin(probFraction: number, effectiveN: number): number {
  const se = effectiveN > 0 ? Math.sqrt((probFraction * (1 - probFraction)) / effectiveN) : 0.2;
  const marginPct = se * 100;
  return Math.max(3, Math.min(20, marginPct));
}

export function estimateAdmission(input: EstimatorInput, model: KernelModel): EstimatorOutcome {
  const { c50, c70, quota, turnover, targetQuota, expectedCompetition, userScore } = input;

  if (!isTripleComplete(c50) || !isTripleComplete(c70)) {
    return { insufficient: true, reason: "과거 3개년 50%·70%컷이 모두 있어야 계산할 수 있어요." };
  }
  if (quota[0] <= 0) {
    return { insufficient: true, reason: "가장 최근해(2026) 모집 인원이 있어야 계산할 수 있어요." };
  }
  if (model.database.length === 0) {
    return { insufficient: true, reason: "비교할 과거 사례 데이터를 불러오지 못했어요." };
  }

  // 배열은 [2026, 2025, 2024] 순 — 방법론 문서의 x1(가장 과거)~x3(가장 최근) 순으로 뒤집는다.
  const level50 = (c50[2] + c50[1] + c50[0]) / 3;
  const level70 = (c70[2] + c70[1] + c70[0]) / 3;
  const trend70 = c70[0] - c70[1];

  const target: { level50: number; level70: number; trend70: number; capChange?: number; compRaw?: number } = {
    level50,
    level70,
    trend70,
  };
  if (targetQuota > 0 && quota[0] > 0) target.capChange = Math.log(targetQuota) - Math.log(quota[0]);
  if (expectedCompetition > 0) target.compRaw = expectedCompetition;

  const { weights, effectiveN } = computeKernelWeights(target, model.database, model.bins);
  const y50List = model.database.map((r) => r.y50);
  const y70List = model.database.map((r) => r.y70);

  const p50Predicted = weightedMedian(y50List, weights);
  const p70Predicted = weightedMedian(y70List, weights);

  const ratioPoint = computeAdmitRatio(quota[0], Math.max(turnover[0], 0));
  const { simulated } = simulateMarginoseon(y50List, y70List, weights, ratioPoint, RATIO_STD);
  const probFraction = admissionProbabilityFromSimulation(simulated, userScore);
  const prob = probFraction * 100;

  const margin = estimateProbabilityMargin(probFraction, effectiveN);
  const probLow = Math.max(0, Math.round(prob - margin));
  let probHigh = Math.min(100, Math.round(prob + margin));
  if (probHigh <= probLow) probHigh = Math.min(100, probLow + 2);

  const curve = buildProbabilityCurve(simulated, { p50Predicted, p70Predicted, userScore });

  return { p50Predicted, p70Predicted, prob, probLow, probHigh, effectiveN, curve };
}

/** 결과 시각화용 곡선 — 성적(등급) 값을 촘촘히 훑으며 시뮬레이션된 마지노선 분포에서
 * 그 성적으로 합격했다고 볼 수 있는 비율을 그대로 계산한다(로지스틱 근사가 아니라 [F]단계와
 * 같은 방식의 실측 곡선). 표시 범위는 시뮬레이션 분포의 2~98 분위수를 기본으로, 50%컷·
 * 70%컷·사용자 성적이 항상 보이도록 여유를 둔다. */
function buildProbabilityCurve(
  simulated: number[],
  bounds: { p50Predicted: number; p70Predicted: number; userScore: number },
): ProbCurvePoint[] {
  const sorted = [...simulated].sort((a, b) => a - b);
  const pct = (p: number) => sorted[Math.min(sorted.length - 1, Math.max(0, Math.floor(p * (sorted.length - 1))))];
  let lo = Math.min(pct(0.02), bounds.p50Predicted, bounds.userScore);
  let hi = Math.max(pct(0.98), bounds.p70Predicted, bounds.userScore);
  const pad = Math.max((hi - lo) * 0.08, 0.05);
  lo -= pad;
  hi += pad;

  const POINTS = 41;
  const curve: ProbCurvePoint[] = [];
  for (let i = 0; i < POINTS; i++) {
    const grade = lo + ((hi - lo) * i) / (POINTS - 1);
    curve.push({ grade, prob: admissionProbabilityFromSimulation(simulated, grade) * 100 });
  }
  return curve;
}
