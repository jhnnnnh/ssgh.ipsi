"use client";

import { useState } from "react";
import { Search, TriangleAlert } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { createClient } from "@/lib/supabase/client";
import { estimateAdmission, type EstimatorInput, type EstimatorResult } from "@/lib/admission-probability-estimator";
import type { Roster, WonseoCard } from "@/lib/database.types";

type MyCard = Pick<WonseoCard, "id" | "university" | "department" | "enrollment" | "recent_results">;
type Triple = [number, number, number];

const YEAR_COLS = ["2026", "2025", "2024"] as const;

const TIER_COLOR: Record<EstimatorResult["tier"]["key"], { fg: string; bg: string; border: string }> = {
  safe: { fg: "text-emerald-700", bg: "bg-emerald-50", border: "border-emerald-200" },
  watch: { fg: "text-amber-700", bg: "bg-amber-50", border: "border-amber-200" },
  risk: { fg: "text-rose-700", bg: "bg-rose-50", border: "border-rose-200" },
};

function parseNum(v: string): number {
  return parseFloat(v) || 0;
}
function parseIntNum(v: string): number {
  return parseInt(v, 10) || 0;
}
function fmt2(n: number): string {
  return (n >= 0 ? "+" : "") + n.toFixed(2);
}

function emptyForm() {
  return {
    deptName: "",
    userScore: "",
    targetQuota: "",
    expectedCompetition: "",
    c50: ["", "", ""] as [string, string, string],
    c70: ["", "", ""] as [string, string, string],
    quota: ["", "", ""] as [string, string, string],
    turnover: ["", "", ""] as [string, string, string],
    applicants: ["", "", ""] as [string, string, string],
  };
}

/** 카드의 최근 입결(연도별 자유 텍스트)을 "2026/2025/2024" 3칸에 최대한 맞춰 채운다.
 * year 텍스트가 그 세 값 중 하나와 일치하면 그 칸에, 아니면 최신순으로 앞에서부터 채운다. */
function recentResultsToForm(card: MyCard) {
  const sorted = [...(card.recent_results ?? [])].sort((a, b) => Number(b.year) - Number(a.year));
  const c50: [string, string, string] = ["", "", ""];
  const c70: [string, string, string] = ["", "", ""];
  const quota: [string, string, string] = ["", "", ""];
  const turnover: [string, string, string] = ["", "", ""];
  const applicants: [string, string, string] = ["", "", ""];

  sorted.forEach((y, idx) => {
    const col = YEAR_COLS.indexOf(y.year as (typeof YEAR_COLS)[number]);
    const slot = col >= 0 ? col : idx;
    if (slot > 2) return;
    c50[slot] = y.cut50 ?? "";
    c70[slot] = y.cut70 ?? "";
    quota[slot] = y.enrollment ?? "";
    turnover[slot] = y.fillCount ?? "";
    applicants[slot] = y.competitionRate ?? "";
  });

  return { c50, c70, quota, turnover, applicants };
}

export function AdmissionProbabilityCalculator({
  studentId,
  roster,
}: {
  studentId?: string;
  roster?: Pick<Roster, "student_id" | "name">[];
}) {
  const [form, setForm] = useState(emptyForm());
  const [result, setResult] = useState<EstimatorResult | { insufficient: true } | null>(null);
  const [queriedScore, setQueriedScore] = useState(0);

  const [teacherStudentId, setTeacherStudentId] = useState("");
  const [myCards, setMyCards] = useState<MyCard[] | null>(null);
  const effectiveStudentId = studentId ?? teacherStudentId;

  function loadCards(id: string) {
    setTeacherStudentId(id);
    if (!id) {
      setMyCards(null);
      return;
    }
    const supabase = createClient();
    supabase
      .from("wonseo_cards")
      .select("id, university, department, enrollment, recent_results")
      .eq("student_id", id)
      .order("sort_order", { ascending: true })
      .then(({ data }) => setMyCards(data ?? []));
  }

  function pickMyCard(card: MyCard) {
    const filled = recentResultsToForm(card);
    setForm({
      deptName: [card.university, card.department].filter(Boolean).join(" · "),
      userScore: "",
      targetQuota: card.enrollment != null ? String(card.enrollment) : "",
      expectedCompetition: "",
      ...filled,
    });
  }

  function updateField<K extends keyof ReturnType<typeof emptyForm>>(key: K, value: ReturnType<typeof emptyForm>[K]) {
    setForm((f) => ({ ...f, [key]: value }));
  }
  function updateTriple(key: "c50" | "c70" | "quota" | "turnover" | "applicants", idx: number, value: string) {
    setForm((f) => {
      const next = [...f[key]] as [string, string, string];
      next[idx] = value;
      return { ...f, [key]: next };
    });
  }

  function handleQuery() {
    const input: EstimatorInput = {
      userScore: parseNum(form.userScore),
      targetQuota: parseIntNum(form.targetQuota),
      expectedCompetition: parseNum(form.expectedCompetition),
      c50: form.c50.map(parseNum) as Triple,
      c70: form.c70.map(parseNum) as Triple,
      quota: form.quota.map(parseIntNum) as Triple,
      turnover: form.turnover.map(parseIntNum) as Triple,
      applicants: form.applicants.map(parseNum) as Triple,
    };
    setQueriedScore(input.userScore);
    setResult(estimateAdmission(input));
  }

  const ok = result && !("insufficient" in result) ? result : null;

  return (
    <div className="space-y-6">
      <Card className="space-y-1">
        <h3 className="text-sm font-bold text-slate-800">합격 가능성 추정 (참고용)</h3>
        <p className="text-[11px] text-slate-400">
          학생부 교과 전형 한정 · 과거 3개년 입결 기반 통계적 추정치입니다. 정성평가가 섞인 전형에는 적용할
          수 없습니다.
        </p>
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-[420px_1fr] gap-6 items-start">
        {/* 입력 */}
        <Card className="space-y-4">
          {roster && (
            <select
              value={teacherStudentId}
              onChange={(e) => loadCards(e.target.value)}
              className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3 py-2.5 text-sm font-semibold text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500"
            >
              <option value="">학생 선택(내 카드 불러오기)</option>
              {roster.map((r) => (
                <option key={r.student_id} value={r.student_id}>
                  {r.student_id} {r.name}
                </option>
              ))}
            </select>
          )}
          {effectiveStudentId && myCards && myCards.length > 0 && (
            <select
              value=""
              onChange={(e) => {
                const card = myCards.find((c) => c.id === e.target.value);
                if (card) pickMyCard(card);
              }}
              className="w-full bg-indigo-50 border border-indigo-200 text-indigo-700 rounded-xl px-3 py-2.5 text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-indigo-500"
            >
              <option value="">내 원서 카드에서 불러오기(최근 입결 자동 채움)</option>
              {myCards.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.university} · {c.department}
                </option>
              ))}
            </select>
          )}

          <div>
            <label className="block font-bold text-slate-700 mb-1 text-xs">지원 대학 · 학과</label>
            <input
              value={form.deptName}
              onChange={(e) => updateField("deptName", e.target.value)}
              className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3 py-2.5 text-sm font-semibold text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block font-bold text-slate-700 mb-1 text-xs">내신 등급</label>
              <input
                type="number"
                step="0.01"
                value={form.userScore}
                onChange={(e) => updateField("userScore", e.target.value)}
                className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3 py-2.5 text-sm font-semibold text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>
            <div>
              <label className="block font-bold text-slate-700 mb-1 text-xs">올해 모집 정원</label>
              <input
                type="number"
                value={form.targetQuota}
                onChange={(e) => updateField("targetQuota", e.target.value)}
                className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3 py-2.5 text-sm font-semibold text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>
          </div>

          <div>
            <label className="block font-bold text-slate-700 mb-1 text-xs">
              올해 예상 경쟁률 <span className="font-normal text-slate-400">(선택)</span>
            </label>
            <input
              type="number"
              step="0.01"
              value={form.expectedCompetition}
              onChange={(e) => updateField("expectedCompetition", e.target.value)}
              className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3 py-2.5 text-sm font-semibold text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>

          <div className="overflow-x-auto">
            <table className="text-xs border-collapse w-full">
              <caption className="text-left text-xs font-bold text-slate-700 pb-2">
                과거 3개년 입결 <span className="font-normal text-slate-400">(없는 연도는 비워두세요)</span>
              </caption>
              <thead>
                <tr>
                  <th className="p-1.5 bg-slate-50 border border-slate-200" />
                  {YEAR_COLS.map((y) => (
                    <th key={y} className="p-1.5 text-center font-bold text-slate-600 bg-slate-50 border border-slate-200">
                      {y}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {(
                  [
                    ["50% 컷", "c50"],
                    ["70% 컷", "c70"],
                    ["모집 인원", "quota"],
                    ["충원 인원", "turnover"],
                    ["경쟁률", "applicants"],
                  ] as const
                ).map(([label, key]) => (
                  <tr key={key}>
                    <td className="p-1.5 text-left font-bold text-slate-600 bg-slate-50 border border-slate-200 whitespace-nowrap">
                      {label}
                    </td>
                    {form[key].map((v, i) => (
                      <td key={i} className="p-0 border border-slate-200">
                        <input
                          type="number"
                          step="0.01"
                          value={v}
                          onChange={(e) => updateTriple(key, i, e.target.value)}
                          className="w-full text-center px-1 py-1.5 text-xs font-semibold text-slate-800 focus:outline-none focus:bg-indigo-50"
                        />
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <button
            type="button"
            onClick={handleQuery}
            className="w-full px-4 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-sm font-bold transition shadow-xs flex items-center justify-center gap-1.5"
          >
            <Search className="w-3.5 h-3.5" />
            조회
          </button>
        </Card>

        {/* 결과 */}
        <div className="space-y-4">
          <Card className="flex items-end justify-between gap-4 flex-wrap">
            <div>
              <p className="text-[11px] text-slate-400">{form.deptName || "학과명을 입력하면 표시됩니다"}</p>
              {!result && <p className="text-lg font-bold text-slate-400">분석 대기중</p>}
              {result && "insufficient" in result && <p className="text-lg font-bold text-slate-400">데이터 부족</p>}
              {ok && <p className={`text-lg font-bold ${TIER_COLOR[ok.tier.key].fg}`}>{ok.tier.name} 지원</p>}
            </div>
            <div className="text-right">
              <p className="text-3xl font-bold text-slate-900">
                {ok ? `${ok.probRangeLow}~${ok.probRangeHigh}%` : "—"}
              </p>
              <p className="text-[11px] text-slate-400 mt-0.5">추정 합격 가능성</p>
            </div>
          </Card>

          {result && "insufficient" in result && (
            <Card>
              <p className="text-xs text-slate-500">50%컷·70%컷 중 최소 1개년 데이터가 있어야 계산할 수 있어요.</p>
            </Card>
          )}

          {ok && (
            <>
              <Card className="space-y-2">
                <div className="h-8 relative border border-slate-800 bg-slate-50 overflow-hidden">
                  <div
                    className={`absolute inset-y-0 left-0 opacity-30 ${TIER_COLOR[ok.tier.key].fg.replace("text-", "bg-")}`}
                    style={{ width: `${Math.max(0, Math.min(100, ok.stripPos * 100))}%` }}
                  />
                  <div
                    className="absolute inset-y-0 w-0.5 bg-slate-900"
                    style={{ left: `${Math.max(0, Math.min(100, ok.stripPos * 100))}%` }}
                  />
                </div>
                <div className="flex justify-between text-[10px] text-slate-400 font-mono">
                  <span>50% 컷 예측 {ok.p50Predicted.toFixed(2)}</span>
                  <span>마지노선 추정 {ok.p100Predicted.toFixed(2)}</span>
                </div>
              </Card>

              <div className="grid grid-cols-3 gap-px bg-slate-200 border border-slate-200">
                <div className="bg-white p-3">
                  <p className="text-[10px] text-slate-400">50%컷 예측</p>
                  <p className="text-base font-bold text-slate-800">{ok.p50Predicted.toFixed(2)} 등급</p>
                </div>
                <div className="bg-white p-3">
                  <p className="text-[10px] text-slate-400">70%컷 예측</p>
                  <p className="text-base font-bold text-slate-800">{ok.p70Predicted.toFixed(2)} 등급</p>
                </div>
                <div className="bg-white p-3">
                  <p className="text-[10px] text-slate-400">마지노선 대비 점수차</p>
                  <p className={`text-base font-bold ${ok.gap100 >= 0 ? "text-emerald-600" : "text-rose-600"}`}>
                    {fmt2(ok.gap100)} 등급
                  </p>
                </div>
              </div>

              <p className="flex items-start gap-1.5 text-[11px] text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
                <TriangleAlert className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                이 수치는 과거 3개년 입결 패턴을 바탕으로 한 통계적 추정이며, 실제 합격을 보장하지 않습니다.
                최종 지원 결정 전 입학처 공식 자료와 담임·진학 교사 상담을 함께 참고하세요.
              </p>

              <details className="border border-slate-200 rounded-xl bg-white">
                <summary className="px-4 py-3 text-xs font-bold text-slate-700 cursor-pointer select-none">
                  이 수치는 어떻게 계산되었나요?
                </summary>
                <div className="px-4 pb-4 text-xs leading-relaxed text-slate-600 space-y-2 border-t border-slate-100 pt-3">
                  <p>
                    최근 연도 컷을 기준값으로 삼고(3개년 가중평균은 최근 추세를 희석시켜 오히려 편향을
                    키움), 예상 경쟁률 변화를 회귀식으로 보정합니다. 50%→70%컷의 스프레드와 충원비율을
                    다중회귀에 넣어 &ldquo;등록 마지노선(100%컷)&rdquo;을 추정하고, 그 지점을 확률 50%로 고정한
                    로지스틱 곡선 위에 입력 등급을 대입합니다.
                  </p>
                  <ProbCurve result={ok} userScore={queriedScore} />
                  <p className="text-slate-400">
                    본 모형의 계수는 복수 연도·복수 학과 표본에 대한 회귀분석으로 추정된 값이며, 표본 외
                    예측의 성격상 실제값과 편차가 발생할 수 있습니다. 정성평가 요소가 결합된 전형은 잔차의
                    분산이 커집니다.
                  </p>
                </div>
              </details>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function ProbCurve({ result, userScore }: { result: EstimatorResult; userScore: number }) {
  const W = 460,
    H = 220;
  const marginL = 34,
    marginR = 14,
    marginT = 14,
    marginB = 28;
  const plotW = W - marginL - marginR;
  const plotH = H - marginT - marginB;

  const cut50 = result.p50Predicted,
    cut70 = result.p70Predicted,
    cut100 = result.p100Predicted;
  const pad = Math.max(cut100 - cut50, 0.1) * 0.5;
  const xMin = Math.min(cut50, userScore) - pad;
  const xMax = Math.max(cut100, userScore) + pad;
  const xRange = Math.max(xMax - xMin, 0.01);

  const X = (g: number) => marginL + ((g - xMin) / xRange) * plotW;
  const Y = (p: number) => marginT + plotH - p * plotH;

  const steps = 60;
  let pathD = "";
  for (let i = 0; i <= steps; i++) {
    const g = xMin + (xRange * i) / steps;
    const z = result.k * (cut100 - g);
    const p = 1 / (1 + Math.exp(-Math.max(-25, Math.min(25, z))));
    pathD += `${i === 0 ? "M" : "L"}${X(g).toFixed(1)},${Y(p).toFixed(1)} `;
  }

  const userZ = result.k * (cut100 - userScore);
  const userP = 1 / (1 + Math.exp(-Math.max(-25, Math.min(25, userZ))));

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto border border-slate-200 bg-slate-50">
      <line x1={marginL} y1={marginT} x2={marginL} y2={marginT + plotH} stroke="#333" />
      <line x1={marginL} y1={marginT + plotH} x2={marginL + plotW} y2={marginT + plotH} stroke="#333" />
      {[0, 0.25, 0.5, 0.75, 1.0].map((p) => (
        <g key={p}>
          <line x1={marginL - 4} y1={Y(p)} x2={marginL} y2={Y(p)} stroke="#94a3b8" />
          <text x={marginL - 7} y={Y(p) + 3} fontSize={9} fill="#94a3b8" textAnchor="end">
            {Math.round(p * 100)}%
          </text>
        </g>
      ))}
      <line x1={X(cut50)} y1={marginT} x2={X(cut50)} y2={marginT + plotH} stroke="#059669" strokeWidth={1.3} strokeDasharray="4,3" />
      <line x1={X(cut70)} y1={marginT} x2={X(cut70)} y2={marginT + plotH} stroke="#b45309" strokeWidth={1.3} strokeDasharray="4,3" />
      <line x1={X(cut100)} y1={marginT} x2={X(cut100)} y2={marginT + plotH} stroke="#dc2626" strokeWidth={1.3} strokeDasharray="4,3" />
      <path d={pathD} fill="none" stroke="#555" strokeWidth={1.6} />
      <circle cx={X(userScore)} cy={Y(userP)} r={4.5} fill="#4f46e5" stroke="#fff" strokeWidth={1.2} />
      <text x={marginL + plotW / 2} y={H - 6} fontSize={10} textAnchor="middle" fill="#555">
        내신 등급 →
      </text>
    </svg>
  );
}
