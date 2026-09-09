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
 * 교과전형에 한해 검증됐다 — 종합전형에는 이 파이프라인을 적용하지 않는다.
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

export type EstimatorResult = {
  p50Predicted: number;
  p70Predicted: number;
  /** 0~100. */
  prob: number;
  /** [B]단계 유효표본수 — 참고 사례가 적을수록 작아진다(화면에 강제 노출하지 않아도 되지만 참고용으로 남김). */
  effectiveN: number;
};

export type EstimatorOutcome = EstimatorResult | { insufficient: true; reason: string };

function isTripleComplete(t: [number, number, number]): boolean {
  return t.every((v) => v > 0);
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
  const prob = admissionProbabilityFromSimulation(simulated, userScore) * 100;

  return { p50Predicted, p70Predicted, prob, effectiveN };
}
