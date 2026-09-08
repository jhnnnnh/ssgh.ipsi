/**
 * 교과전형 3개년 입결 → 다음 해 컷 예측 — 4차원 국소가중(커널) 방식.
 * `입결예측_방법론_v2.md` 방법론을 그대로 옮긴 구현이다. 파라미터(σ_k, r_k)는
 * 임의로 바꾸지 않는다.
 */

export type KernelDatabaseRow = {
  level: number;
  step2: number;
  capChange: number;
  /** 해당 그룹의 "다음 해"(예측 대상 해) 실제 경쟁률 원값 — 국소 z-score 변환 전. */
  compRaw: number;
  /** 해당 그룹의 "다음 해"(예측 대상 해) 실제 컷값 — 예측하려는 y. */
  y: number;
};

export type LevelBin = { lo: number; hi: number; mu: number; sigma: number };

const PARAMS_50 = {
  level: { sigma: 1.2444, r: 1.8 },
  step2: { sigma: 0.5362, r: 0.4 },
  capChange: { sigma: 0.2756, r: 0.2 },
  compLocal: { sigma: 1.0, r: 0.7 },
};
const PARAMS_70 = {
  level: { sigma: 1.3571, r: 2.2 },
  step2: { sigma: 0.5807, r: 0.4 },
  capChange: { sigma: 0.2815, r: 0.15 },
  compLocal: { sigma: 1.0, r: 0.7 },
};
// 2차원 축소판(경쟁률·모집인원 정보 없을 때)
const PARAMS_50_2D = { level: { sigma: 1.2495, r: 2.0 }, step2: { sigma: 0.5409, r: 0.9 } };
const PARAMS_70_2D = { level: { sigma: 1.3571, r: 2.0 }, step2: { sigma: 0.5807, r: 0.6 } };

const BIN_COUNT = 8;

/** level 기준 분위수 등분(qcut)으로 8구간을 나누고, 구간별 경쟁률(compRaw)의 평균·표준편차를 구한다. */
export function buildLevelBinTable(rows: KernelDatabaseRow[]): LevelBin[] {
  const sorted = [...rows].sort((a, b) => a.level - b.level);
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
    bins.push({ lo: slice[0].level, hi: slice[slice.length - 1].level, mu, sigma });
  }
  return bins;
}

function lookupBin(level: number, bins: LevelBin[]): { mu: number; sigma: number } {
  for (const b of bins) {
    if (level >= b.lo && level <= b.hi) return b;
  }
  // 범위 밖(가장 상위/하위보다 더 극단)이면 가장 가까운 구간을 쓴다.
  if (bins.length === 0) return { mu: 0, sigma: 1 };
  const first = bins[0];
  const last = bins[bins.length - 1];
  return level < first.lo ? first : last;
}

export type KernelPrediction = {
  predicted: number;
  p10: number;
  p25: number;
  p50: number;
  p75: number;
  p90: number;
  effectiveN: number;
};

function weightedQuantile(sortedPairs: { y: number; w: number }[], q: number): number {
  const totalW = sortedPairs.reduce((a, p) => a + p.w, 0);
  if (totalW <= 0) return sortedPairs.length ? sortedPairs[Math.floor(sortedPairs.length / 2)].y : 0;
  let cum = 0;
  for (const p of sortedPairs) {
    cum += p.w;
    if (cum / totalW >= q) return p.y;
  }
  return sortedPairs[sortedPairs.length - 1].y;
}

/** 4차원(level, step2, capChange, compLocal) 커널 예측. 경쟁률·모집인원 정보가 있을 때. */
export function predictCutKernel4D(
  target: { level: number; step2: number; capChange: number; compRaw: number },
  database: KernelDatabaseRow[],
  bins: LevelBin[],
  params: typeof PARAMS_50,
): KernelPrediction {
  const { mu, sigma } = lookupBin(target.level, bins);
  const compLocal = (target.compRaw - mu) / sigma;

  const h = {
    level: (params.level.sigma * 0.25) / params.level.r,
    step2: (params.step2.sigma * 0.25) / params.step2.r,
    capChange: (params.capChange.sigma * 0.25) / params.capChange.r,
    compLocal: (params.compLocal.sigma * 0.25) / params.compLocal.r,
  };

  const weighted: { y: number; w: number }[] = [];
  for (const row of database) {
    const rowBin = lookupBin(row.level, bins);
    const rowCompLocal = (row.compRaw - rowBin.mu) / rowBin.sigma;
    const dist2 =
      ((row.level - target.level) / h.level) ** 2 +
      ((row.step2 - target.step2) / h.step2) ** 2 +
      ((row.capChange - target.capChange) / h.capChange) ** 2 +
      ((rowCompLocal - compLocal) / h.compLocal) ** 2;
    const w = Math.exp(-0.5 * dist2);
    if (w > 1e-6) weighted.push({ y: row.y, w });
  }
  return finalizeKernelResult(weighted);
}

/** 2차원(level, step2) 축소판. 경쟁률·모집인원을 모를 때 대체 사용. */
export function predictCutKernel2D(
  target: { level: number; step2: number },
  database: KernelDatabaseRow[],
  params: typeof PARAMS_50_2D,
): KernelPrediction {
  const h = {
    level: (params.level.sigma * 0.25) / params.level.r,
    step2: (params.step2.sigma * 0.25) / params.step2.r,
  };
  const weighted: { y: number; w: number }[] = [];
  for (const row of database) {
    const dist2 = ((row.level - target.level) / h.level) ** 2 + ((row.step2 - target.step2) / h.step2) ** 2;
    const w = Math.exp(-0.5 * dist2);
    if (w > 1e-6) weighted.push({ y: row.y, w });
  }
  return finalizeKernelResult(weighted);
}

function finalizeKernelResult(weighted: { y: number; w: number }[]): KernelPrediction {
  if (weighted.length === 0) {
    return { predicted: 0, p10: 0, p25: 0, p50: 0, p75: 0, p90: 0, effectiveN: 0 };
  }
  const totalW = weighted.reduce((a, p) => a + p.w, 0);
  const expected = weighted.reduce((a, p) => a + (p.w / totalW) * p.y, 0);
  const sorted = [...weighted].sort((a, b) => a.y - b.y);
  const effectiveN = 1 / weighted.reduce((a, p) => a + (p.w / totalW) ** 2, 0);
  return {
    predicted: expected,
    p10: weightedQuantile(sorted, 0.1),
    p25: weightedQuantile(sorted, 0.25),
    p50: weightedQuantile(sorted, 0.5),
    p75: weightedQuantile(sorted, 0.75),
    p90: weightedQuantile(sorted, 0.9),
    effectiveN,
  };
}

export { PARAMS_50, PARAMS_70, PARAMS_50_2D, PARAMS_70_2D };
