/**
 * 교과전형 3개년 입결 → 다음 해 컷·합격확률 예측 — 통합 파이프라인(v3).
 * `합격가능성_계산구조_v3_최종.md` 스펙을 그대로 구현한다. "50컷 예측식 → 70컷 예측식 →
 * 마지노선 확장식 → 확률 변환식"처럼 개별 공식을 이어붙이지 않고, 비슷한 과거 사례를
 * 찾아 그 실제 결과를 몬테카를로로 세어 확률을 구하는 하나의 파이프라인으로 계산한다.
 */

export type KernelDatabaseRow = {
  level50: number;
  level70: number;
  trend70: number;
  capChange: number;
  /** 이 그룹의 "다음 해"(예측대상 해) 실제 경쟁률 원값 — 국소 z-score 변환 전. */
  compRaw: number;
  /** 이 그룹의 "다음 해"(예측대상 해) 실제 50%컷·70%컷. */
  y50: number;
  y70: number;
};

export type LevelBin = { lo: number; hi: number; mu: number; sigma: number };

const BIN_COUNT = 8;

/** level50 기준 분위수 등분(qcut)으로 8구간을 나누고, 구간별 경쟁률(compRaw)의 평균·표준편차를 구한다. */
export function buildLevelBinTable(rows: KernelDatabaseRow[]): LevelBin[] {
  const sorted = [...rows].sort((a, b) => a.level50 - b.level50);
  const n = sorted.length;
  const bins: LevelBin[] = [];
  for (let b = 0; b < BIN_COUNT; b++) {
    const start = Math.floor((n * b) / BIN_COUNT);
    const end = b === BIN_COUNT - 1 ? n : Math.floor((n * (b + 1)) / BIN_COUNT);
    const slice = sorted.slice(start, end);
    if (slice.length === 0) continue;
    const comps = slice.map((r) => r.compRaw);
    const mu = comps.reduce((a, c) => a + c, 0) / comps.length;
    const variance = comps.reduce((a, c) => a + (c - mu) ** 2, 0) / comps.length;
    const sigma = Math.sqrt(variance) || 1;
    bins.push({ lo: slice[0].level50, hi: slice[slice.length - 1].level50, mu, sigma });
  }
  return bins;
}

function lookupBin(level: number, bins: LevelBin[]): { mu: number; sigma: number } {
  for (const b of bins) {
    if (level >= b.lo && level <= b.hi) return b;
  }
  // 범위 밖(가장 상위/하위보다 더 극단)이면 외삽하지 않고 가장 가까운 구간을 그대로 쓴다.
  if (bins.length === 0) return { mu: 0, sigma: 1 };
  return level < bins[0].lo ? bins[0] : bins[bins.length - 1];
}

/**
 * 6차원 중 trend50은 가중치 비율 r=0으로 확정됐다(문서 3.1절) — 대역폭이 무한대가 되어
 * 거리 기여가 항상 0이므로, 애초에 계산에서 빼는 5차원 모델로 구현해도 결과는 같다(문서가
 * 직접 명시한 축소).
 */
const PARAMS = {
  level50: { sigma: 1.2393, r: 2.2 },
  level70: { sigma: 1.3467, r: 2.2 },
  trend70: { sigma: 0.5705, r: 0.3 },
  capChange: { sigma: 0.2769, r: 0.2 },
  compLocal: { sigma: 0.9985, r: 0.9 },
};

const BANDWIDTH = {
  level50: (PARAMS.level50.sigma * 0.25) / PARAMS.level50.r,
  level70: (PARAMS.level70.sigma * 0.25) / PARAMS.level70.r,
  trend70: (PARAMS.trend70.sigma * 0.25) / PARAMS.trend70.r,
  capChange: (PARAMS.capChange.sigma * 0.25) / PARAMS.capChange.r,
  compLocal: (PARAMS.compLocal.sigma * 0.25) / PARAMS.compLocal.r,
};

export type TargetVector = {
  level50: number;
  level70: number;
  trend70: number;
  /** 모집인원 증감률·예상 경쟁률 정보가 없으면 해당 차원은 거리 계산에서 뺀다(우아한 성능 저하 —
   * 문서 스펙에는 없는 보완이지만, 입력이 부분적으로 비어 있어도 계산 자체는 계속 진행하기 위함). */
  capChange?: number;
  compRaw?: number;
};

export type KernelWeightResult = {
  /** database와 같은 길이·순서로 정규화된(합=1) 가중치. */
  weights: number[];
  effectiveN: number;
};

/** [B]단계 — 5차원(또는 capChange/compLocal이 없으면 그만큼 줄어든) 국소가중 거리로
 * database의 각 행에 가중치를 매긴다. */
export function computeKernelWeights(target: TargetVector, database: KernelDatabaseRow[], bins: LevelBin[]): KernelWeightResult {
  const targetBin = lookupBin(target.level50, bins);
  const targetCompLocal = target.compRaw != null ? (target.compRaw - targetBin.mu) / targetBin.sigma : null;

  const rawWeights = database.map((row) => {
    let dist2 =
      ((row.level50 - target.level50) / BANDWIDTH.level50) ** 2 +
      ((row.level70 - target.level70) / BANDWIDTH.level70) ** 2 +
      ((row.trend70 - target.trend70) / BANDWIDTH.trend70) ** 2;
    if (target.capChange != null) {
      dist2 += ((row.capChange - target.capChange) / BANDWIDTH.capChange) ** 2;
    }
    if (targetCompLocal != null) {
      const rowBin = lookupBin(row.level50, bins);
      const rowCompLocal = (row.compRaw - rowBin.mu) / rowBin.sigma;
      dist2 += ((rowCompLocal - targetCompLocal) / BANDWIDTH.compLocal) ** 2;
    }
    return Math.exp(-0.5 * dist2);
  });

  const total = rawWeights.reduce((a, w) => a + w, 0);
  if (total <= 0) return { weights: rawWeights, effectiveN: 0 };
  const weights = rawWeights.map((w) => w / total);
  const effectiveN = 1 / weights.reduce((a, w) => a + w * w, 0);
  return { weights, effectiveN };
}

/** 가중분위수(선형보간). 문서 4절 의사코드 그대로 — 누적가중치를 "각 지점의 중심"으로
 * 잡아서(절반은 그 지점 이전, 절반은 이후) 선형보간한다. */
export function weightedQuantile(values: number[], weights: number[], q: number): number {
  const totalW = weights.reduce((a, w) => a + w, 0);
  if (totalW <= 0 || values.length === 0) return 0;
  const order = values.map((_, i) => i).sort((a, b) => values[a] - values[b]);
  const sortedValues = order.map((i) => values[i]);
  const sortedWeights = order.map((i) => weights[i]);

  const cum: number[] = [];
  let running = 0;
  for (let i = 0; i < sortedWeights.length; i++) {
    running += sortedWeights[i];
    cum.push((running - 0.5 * sortedWeights[i]) / totalW);
  }
  if (q <= cum[0]) return sortedValues[0];
  if (q >= cum[cum.length - 1]) return sortedValues[sortedValues.length - 1];
  for (let i = 0; i < cum.length - 1; i++) {
    if (q >= cum[i] && q <= cum[i + 1]) {
      const t = cum[i + 1] === cum[i] ? 0 : (q - cum[i]) / (cum[i + 1] - cum[i]);
      return sortedValues[i] + t * (sortedValues[i + 1] - sortedValues[i]);
    }
  }
  return sortedValues[sortedValues.length - 1];
}

/** [C]단계 — 가중산술평균 대신 가중중앙값을 쓴다(문서 4절: 컷 분포가 비대칭이라 평균은
 * 극단치에 끌려가지만 중앙값은 강건하다). */
export function weightedMedian(values: number[], weights: number[]): number {
  return weightedQuantile(values, weights, 0.5);
}

/** 가중치를 확률로 쓰는 복원추출(weighted sampling with replacement). 누적분포 이진탐색. */
function weightedRandomIndices(weights: number[], n: number): number[] {
  const total = weights.reduce((a, w) => a + w, 0);
  const result: number[] = new Array(n).fill(0);
  if (total <= 0 || weights.length === 0) return result;
  const cum: number[] = [];
  let running = 0;
  for (const w of weights) {
    running += w;
    cum.push(running / total);
  }
  for (let i = 0; i < n; i++) {
    const r = Math.random();
    let lo = 0;
    let hi = cum.length - 1;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (cum[mid] < r) lo = mid + 1;
      else hi = mid;
    }
    result[i] = lo;
  }
  return result;
}

/** Box-Muller 변환으로 정규분포 난수를 뽑는다. */
function normalRandom(mean: number, std: number): number {
  const u1 = Math.random() || Number.EPSILON;
  const u2 = Math.random();
  const z = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
  return mean + z * std;
}

const MIN_ADMIT = 35;
const MAX_ADMIT = 132;
const RATIO_INTERCEPT = -2.289;
const RATIO_SLOPE = 1.184;
const RATIO_MIN = 0.3;

/** [D]단계 — DB의 다른 학과와는 무관하게, "이 학과 자신의" 가장 최근해 합격자수(모집인원+
 * 충원인원)만으로 마지노선 배수(ratio)를 구한다. 대교협 실측 6개 학과(514명)로 도출한 회귀식. */
export function computeAdmitRatio(mostRecentQuota: number, mostRecentTurnover: number): number {
  const admitCount = mostRecentQuota + mostRecentTurnover;
  const clipped = Math.min(MAX_ADMIT, Math.max(MIN_ADMIT, admitCount));
  const ratio = RATIO_INTERCEPT + RATIO_SLOPE * Math.log(clipped);
  return Math.max(ratio, RATIO_MIN);
}

/** [D]단계 — ratio의 불확실성(표준편차). 대교협 실측 6개 학과의 leave-one-out 오차를
 * 각 학과의 스프레드로 나눠 "ratio 단위" 오차로 바꾼 뒤 표준편차를 구한다. 고정 상수로
 * 박아두지 않고 원본 배열로 매번 계산해, 재검증되면 배열만 고치면 되게 한다. */
const RATIO_LOO_ERRORS = [0.081, 0.082, -0.091, -0.023, -0.017, 0.087];
const RATIO_LOO_SPREADS = [0.11, 0.17, 0.08, 0.06, 0.07, 0.17];
export const RATIO_STD = (() => {
  const errs = RATIO_LOO_ERRORS.map((e, i) => e / RATIO_LOO_SPREADS[i]);
  const mean = errs.reduce((a, e) => a + e, 0) / errs.length;
  const variance = errs.reduce((a, e) => a + (e - mean) ** 2, 0) / errs.length;
  return Math.sqrt(variance);
})();

export type MonteCarloResult = {
  /** 마지노선 시뮬레이션 값(길이 N). 화면에는 표시하지 않고 확률 계산에만 쓴다. */
  simulated: number[];
};

/** [E]단계 — 마지노선을 하나의 확정값이 아니라 분포로 만든다. [B]의 가중치를 확률 삼아
 * 과거 실제 (50컷,70컷) 쌍을 복원추출하고, ratio는 정규분포로 흔들어 시행마다 마지노선을
 * 계산한다(정규분포는 ratio에만 가정하고, 컷 자체는 DB의 실제 분포 모양을 그대로 쓴다). */
export function simulateMarginoseon(
  y50: number[],
  y70: number[],
  weights: number[],
  ratioPoint: number,
  ratioStd: number,
  n = 10000,
): MonteCarloResult {
  const drawn = weightedRandomIndices(weights, n);
  const simulated = new Array<number>(n);
  for (let i = 0; i < n; i++) {
    const idx = drawn[i];
    const sim50 = y50[idx];
    const sim70 = y70[idx];
    const spread = Math.max(sim70 - sim50, 0.01);
    const ratio = Math.max(normalRandom(ratioPoint, ratioStd), 0.1);
    simulated[i] = sim50 + ratio * spread;
  }
  return { simulated };
}

/** [F]단계 — 시뮬레이션된 마지노선 분포에서 "사용자 성적 이상"인 비율을 그대로 센다.
 * 로지스틱 함수도, 임의의 기울기 상수도, 베이지안 축소도 없다 — 불확실성은 이미 [E]단계
 * (컷의 표본 흩어짐 + ratio의 추정 오차)에 반영되어 있으므로 있는 그대로 센다.
 * 등급은 숫자가 작을수록 좋으므로, 마지노선(등록 가능한 최저 성적)이 사용자 성적보다
 * 크거나 같으면(=사용자 성적이 마지노선 안쪽이면) 합격으로 센다. */
export function admissionProbabilityFromSimulation(simulated: number[], userScore: number): number {
  if (simulated.length === 0) return 0;
  let count = 0;
  for (const v of simulated) if (v >= userScore) count++;
  return count / simulated.length;
}
