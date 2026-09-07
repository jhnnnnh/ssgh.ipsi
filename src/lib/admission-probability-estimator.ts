/**
 * 학생부 교과 합격 가능성 추정 엔진. 사용자가 별도로 만들어 검증한 리서치(대교협 실측
 * 지원자 데이터 7개 학과 900명+, 국립부경대 2023~2026년 68개 학과-전형 4개년 데이터)를
 * 그대로 옮긴 것으로, 계수를 임의로 바꾸지 않는다. 원본: 학생부_교과_합격_예측_리마스터.html
 *
 * 핵심 결론:
 *  A. 50%/70%컷은 "최종 등록자" 분포의 퍼센타일일 뿐 합격확률이 아니다. 확률이 정확히
 *     50%가 되는 지점은 등록 마지노선(100%컷) 그 자체다.
 *  B. 마지노선까지의 확장폭은 스프레드(70%-50%컷)만으로 안 되고, 충원비율이 핵심
 *     변수다(6개 학과 다중회귀로 확인: 확장폭 = -0.155 + 0.4105×충원비율 + 1.5181×스프레드).
 *  C. 3개년 가중평균은 최근 추세를 과거로 희석시켜 편향을 만든다 — "최근연도값 + 경쟁률
 *     보정"이 편향을 크게 줄인다(bias 약 0.10→0.03).
 *  D. 경쟁률이 낮은(=표본이 얕은) 학과는 컷이 해마다 크게 출렁이므로, 신뢰도 보정으로
 *     확률 곡선을 완만하게(50% 쪽으로 신중하게) 만든다.
 */

export type EstimatorInput = {
  userScore: number;
  targetQuota: number;
  expectedCompetition: number;
  /** [2026, 2025, 2024] 순서. 값 없는 연도는 0. */
  c50: [number, number, number];
  c70: [number, number, number];
  quota: [number, number, number];
  turnover: [number, number, number];
  applicants: [number, number, number];
};

export type EstimatorResult = {
  insufficient?: boolean;
  prob: number;
  probRangeLow: number;
  probRangeHigh: number;
  tier: { name: string; key: "safe" | "watch" | "risk" };
  k: number;
  p50Predicted: number;
  p70Predicted: number;
  p100Predicted: number;
  expansion: number;
  turnoverRatioProxy: number;
  gap50: number;
  gap70: number;
  gap100: number;
  stripPos: number;
  expectedRate: number;
  expectedTurnoverCount: number;
  avgCompetitionRatio: number;
  competitionConfidence: number;
  competitionRatioChange: number;
  competitionAdjusted: boolean;
  dataYears: number;
};

function projectCutline(y2026: number, y2025: number, y2024: number) {
  const years = [y2026, y2025, y2024].filter((y) => y > 0);
  if (years.length === 0) return { predicted: 0, dataYears: 0, base: 0 };
  const base = years[0];
  return { predicted: base, dataYears: years.length, base };
}

function competitionAdjust(predictedCut: number, ratio: number, intercept: number, slope: number) {
  if (!ratio || ratio <= 0) return predictedCut;
  return predictedCut + intercept + slope * ratio;
}

function estimateExpansion(cut50: number, cut70: number, turnoverRatio: number) {
  const spread = Math.max(cut70 - cut50, 0.01);
  const A = -0.155,
    B1 = 0.4105,
    B2 = 1.5181;
  let expansion = A + B1 * turnoverRatio + B2 * spread;
  expansion = Math.max(expansion, spread * 0.3);
  return expansion;
}

export function estimateAdmission(input: EstimatorInput): EstimatorResult | { insufficient: true } {
  const { userScore, targetQuota, c50, c70, quota, turnover, applicants: competitionRatios, expectedCompetition } = input;

  const p50 = projectCutline(c50[0], c50[1], c50[2]);
  const p70 = projectCutline(c70[0], c70[1], c70[2]);

  if (p50.dataYears === 0 || p70.dataYears === 0) {
    return { insufficient: true };
  }
  const dataYears = Math.min(p50.dataYears, p70.dataYears);

  let cut50 = p50.predicted;
  let cut70 = p70.predicted;

  const lastYearCompetition = competitionRatios?.[0] ? competitionRatios[0] : 0;
  let competitionRatioChange = 0;
  if (expectedCompetition > 0 && lastYearCompetition > 0) {
    competitionRatioChange = expectedCompetition / lastYearCompetition;
    cut50 = competitionAdjust(cut50, competitionRatioChange, 0.1399, -0.2303);
    cut70 = competitionAdjust(cut70, competitionRatioChange, 0.1424, -0.2404);
  }
  if (cut70 < cut50) cut70 = cut50 + 0.01;

  const r = [0, 1, 2].map((i) => (quota[i] > 0 ? turnover[i] / quota[i] : 0));
  const validR = r.filter((_v, i) => quota[i] > 0);
  const expectedRate = validR.length
    ? (0.5 * (r[0] || 0) + 0.3 * (r[1] || 0) + 0.2 * (r[2] || 0)) /
      ((quota[0] > 0 ? 0.5 : 0) + (quota[1] > 0 ? 0.3 : 0) + (quota[2] > 0 ? 0.2 : 0) || 1)
    : 0.4;
  const expectedTurnoverCount = Math.round(targetQuota * expectedRate);

  const SCALE_QUOTA = 15;
  const quotaScaleFactor = targetQuota > 0 ? Math.sqrt(SCALE_QUOTA / targetQuota) : 1.0;
  const adjustedRate = expectedRate * Math.max(0.6, Math.min(1.6, quotaScaleFactor));
  const turnoverRatioProxy = adjustedRate / (1 + adjustedRate);

  const validRatios = (competitionRatios || []).filter((v) => v > 0);
  const avgCompetitionRatio = validRatios.length ? validRatios.reduce((a, b) => a + b, 0) / validRatios.length : 0;
  const REFERENCE_COMPETITION = 4.0;
  const competitionConfidence =
    avgCompetitionRatio > 0 ? Math.max(0.5, Math.min(1.0, avgCompetitionRatio / REFERENCE_COMPETITION)) : 1.0;

  const expansion = estimateExpansion(cut50, cut70, turnoverRatioProxy);
  let cut100 = cut70 + expansion;
  if (cut100 < cut70 + 0.01) cut100 = cut70 + 0.01;

  const LOGIT_AT_50CUT = Math.log(0.9 / 0.1);
  const distTo50 = Math.max(cut100 - cut50, 0.02);
  const k = (LOGIT_AT_50CUT / distTo50) * competitionConfidence;

  const z = k * (cut100 - userScore);
  const zClamped = Math.max(-25, Math.min(25, z));
  const prob = 1 / (1 + Math.exp(-zClamped));
  const finalProb = Math.max(1, Math.min(99, Math.round(prob * 100)));

  // 정식으로 검증된 신뢰구간은 아니고, 마지노선(100%컷) 추정치의 실증 오차(MAE 약
  // 0.02~0.03등급, 원 도구 검증 당시 기준)를 정규분포로 가정해 역산한 반경이다.
  // 0.03등급 ≈ 표준편차의 약 1배 수준으로, 실제 결과가 이 범위 안에 들어올 확률은
  // 대략 67% 정도로 추정된다(더 넓혔던 0.045등급 기준으로는 약 85%).
  const BASE_RADIUS = 0.03;
  const radius = BASE_RADIUS * (1 + (1 - competitionConfidence));
  const zLow = k * (cut100 - (userScore + radius));
  const zHigh = k * (cut100 - (userScore - radius));
  const probLow = 1 / (1 + Math.exp(-Math.max(-25, Math.min(25, zLow))));
  const probHigh = 1 / (1 + Math.exp(-Math.max(-25, Math.min(25, zHigh))));
  const probRangeLow = Math.max(1, Math.min(99, Math.round(probLow * 100)));
  let probRangeHigh = Math.min(99, Math.round(probHigh * 100));
  if (probRangeHigh <= probRangeLow) probRangeHigh = Math.min(99, probRangeLow + 2);

  const stripSpan = Math.max(cut100 - cut50, 0.05);
  let stripPos = (userScore - cut50) / stripSpan;
  stripPos = Math.max(-0.4, Math.min(1.4, stripPos));

  const gap50 = cut50 - userScore;
  const gap70 = cut70 - userScore;
  const gap100 = cut100 - userScore;

  let tier: EstimatorResult["tier"];
  if (finalProb >= 85) tier = { name: "안정", key: "safe" };
  else if (finalProb >= 65) tier = { name: "적정", key: "safe" };
  else if (finalProb >= 40) tier = { name: "소신", key: "watch" };
  else tier = { name: "상향", key: "risk" };

  return {
    prob: finalProb,
    probRangeLow,
    probRangeHigh,
    tier,
    k,
    p50Predicted: cut50,
    p70Predicted: cut70,
    p100Predicted: cut100,
    expansion,
    turnoverRatioProxy,
    gap50,
    gap70,
    gap100,
    stripPos,
    expectedRate,
    expectedTurnoverCount,
    avgCompetitionRatio,
    competitionConfidence,
    competitionRatioChange,
    competitionAdjusted: competitionRatioChange > 0,
    dataYears,
  };
}
