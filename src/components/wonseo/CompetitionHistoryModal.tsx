"use client";

import { useEffect, useRef, useState } from "react";
import { X, TrendingUp } from "lucide-react";
import { WEEKDAY_KR } from "@/lib/time";
import {
  fetchCompetitionSeries,
  currentElapsedMinutes,
  formatElapsedMinutes,
  type CompetitionSeries,
  type CompetitionLookupResult,
} from "@/lib/admission-competition-lookup";

const CHART_W = 640;
const CHART_H = 280;
const PAD_L = 44;
const PAD_R = 16;
const PAD_T = 16;
const PAD_B = 32;

type RealPoint = { elapsedMin: number; applicants: number | null; ratio: number };

/** startAt 기준 경과분이 실제 달력으로 무슨 요일인지. */
function weekdayAt(startAt: string, elapsedMin: number): string {
  const d = new Date(new Date(startAt).getTime() + elapsedMin * 60000);
  return WEEKDAY_KR[d.getDay()];
}
function timeOfDayAt(startAt: string, elapsedMin: number): string {
  const d = new Date(new Date(startAt).getTime() + elapsedMin * 60000);
  return `${String(d.getHours()).padStart(2, "0")}:00`;
}

function CompetitionChart({ series }: { series: CompetitionSeries }) {
  const [hoverIdx, setHoverIdx] = useState<number | null>(null);
  const svgRef = useRef<SVGSVGElement>(null);

  const realPoints: RealPoint[] = series.points.filter(
    (p): p is RealPoint => p.elapsedMin != null && p.ratio != null,
  );
  const finalPoint = series.points.find(
    (p): p is { elapsedMin: null; applicants: number | null; ratio: number } => p.elapsedMin == null && p.ratio != null,
  );
  const maxElapsed = realPoints.length ? realPoints[realPoints.length - 1].elapsedMin : 0;
  const maxRatio = Math.max(1, ...realPoints.map((p) => p.ratio), finalPoint?.ratio ?? 0);

  function x(min: number) {
    return PAD_L + (maxElapsed > 0 ? (min / maxElapsed) * (CHART_W - PAD_L - PAD_R) : 0);
  }
  function y(ratio: number) {
    return CHART_H - PAD_B - (ratio / (maxRatio * 1.05)) * (CHART_H - PAD_T - PAD_B);
  }

  const linePath = realPoints.map((p, i) => `${i === 0 ? "M" : "L"} ${x(p.elapsedMin)} ${y(p.ratio)}`).join(" ");

  const nowElapsed = currentElapsedMinutes(series.startAt);
  const showNowMarker = nowElapsed >= 0 && nowElapsed <= maxElapsed;

  function handleMoveAt(clientX: number) {
    if (!svgRef.current || realPoints.length === 0) return;
    const rect = svgRef.current.getBoundingClientRect();
    const scale = CHART_W / rect.width;
    const svgX = (clientX - rect.left) * scale;
    const chartRatio = (svgX - PAD_L) / (CHART_W - PAD_L - PAD_R);
    const targetMin = chartRatio * maxElapsed;
    let nearest = 0;
    let best = Infinity;
    realPoints.forEach((p, i) => {
      const d = Math.abs(p.elapsedMin - targetMin);
      if (d < best) {
        best = d;
        nearest = i;
      }
    });
    setHoverIdx(nearest);
  }
  function handleMouseMove(e: React.MouseEvent<SVGSVGElement>) {
    handleMoveAt(e.clientX);
  }
  // 모바일·태블릿에서는 마우스 이벤트가 안 와서 손가락으로 그래프를 짚거나 끌 때
  // 같은 방식으로 값을 보여준다. touch-action:none으로 브라우저가 이 동작을
  // 스크롤/줌으로 가로채지 않게 한다(그래야 preventDefault 없이도 끌기가 된다).
  function handleTouchMove(e: React.TouchEvent<SVGSVGElement>) {
    const touch = e.touches[0];
    if (touch) handleMoveAt(touch.clientX);
  }

  const hoverPoint = hoverIdx != null ? realPoints[hoverIdx] : null;

  return (
    <div className="space-y-3">
      <svg
        ref={svgRef}
        viewBox={`0 0 ${CHART_W} ${CHART_H}`}
        className="w-full h-auto cursor-crosshair touch-none"
        onMouseMove={handleMouseMove}
        onMouseLeave={() => setHoverIdx(null)}
        onTouchStart={handleTouchMove}
        onTouchMove={handleTouchMove}
        onTouchEnd={() => setHoverIdx(null)}
      >
        {/* y축 그리드 + 라벨 */}
        {[0, 0.5, 1].map((t) => {
          const ratioVal = maxRatio * 1.05 * t;
          const yy = y(ratioVal);
          return (
            <g key={t}>
              <line x1={PAD_L} x2={CHART_W - PAD_R} y1={yy} y2={yy} stroke="#e2e8f0" strokeWidth={1} />
              <text x={PAD_L - 6} y={yy + 3} textAnchor="end" fontSize={10} fill="#94a3b8">
                {ratioVal.toFixed(1)}
              </text>
            </g>
          );
        })}
        {/* x축 라벨: 요일만 — 날짜(며칠)보다 요일이 맞아야 작년과 비교가 직관적이다 */}
        {Array.from({ length: Math.floor(maxElapsed / (24 * 60)) + 1 }, (_, d) => d * 24 * 60).map((m) => (
          <text key={m} x={x(m)} y={CHART_H - PAD_B + 16} textAnchor="middle" fontSize={10} fill="#94a3b8">
            {weekdayAt(series.startAt, m)}
          </text>
        ))}

        {linePath && <path d={linePath} fill="none" stroke="#4f46e5" strokeWidth={2} />}

        {showNowMarker && (
          <g>
            <line
              x1={x(nowElapsed)}
              x2={x(nowElapsed)}
              y1={PAD_T}
              y2={CHART_H - PAD_B}
              stroke="#f43f5e"
              strokeWidth={1.5}
              strokeDasharray="4 3"
            />
            <text x={x(nowElapsed)} y={PAD_T + 10} textAnchor="middle" fontSize={10} fontWeight={700} fill="#f43f5e">
              지금
            </text>
          </g>
        )}

        {/* 마우스로 짚은 지점의 정확한 값 */}
        {hoverPoint && (
          <g>
            <line
              x1={x(hoverPoint.elapsedMin)}
              x2={x(hoverPoint.elapsedMin)}
              y1={PAD_T}
              y2={CHART_H - PAD_B}
              stroke="#cbd5e1"
              strokeWidth={1}
            />
            <circle cx={x(hoverPoint.elapsedMin)} cy={y(hoverPoint.ratio)} r={4} fill="#4f46e5" />
            {(() => {
              const label = `${weekdayAt(series.startAt, hoverPoint.elapsedMin)}요일 ${timeOfDayAt(series.startAt, hoverPoint.elapsedMin)} 기준  ${hoverPoint.ratio.toFixed(2)} : 1`;
              const boxW = label.length * 6 + 16;
              let boxX = x(hoverPoint.elapsedMin) - boxW / 2;
              boxX = Math.max(PAD_L, Math.min(CHART_W - PAD_R - boxW, boxX));
              const boxY = Math.max(PAD_T, y(hoverPoint.ratio) - 34);
              return (
                <g>
                  <rect x={boxX} y={boxY} width={boxW} height={22} rx={6} fill="#1e293b" />
                  <text x={boxX + boxW / 2} y={boxY + 15} textAnchor="middle" fontSize={11} fontWeight={700} fill="white">
                    {label}
                  </text>
                </g>
              );
            })()}
          </g>
        )}
      </svg>
      <p className="text-[11px] text-slate-400 -mt-1">
        그래프 위에서 마우스를 움직이거나 손가락으로 짚으면 그 시점의 정확한 경쟁률을 볼 수 있어요.
      </p>

      {finalPoint && (
        <p className="text-xs text-slate-500">
          작년 최종 경쟁률: <strong className="text-slate-800">{finalPoint.ratio.toFixed(2)} : 1</strong>
        </p>
      )}
      {showNowMarker && <p className="text-xs text-slate-500">지금 시점(작년 기준 추정): {formatElapsedMinutes(nowElapsed)}</p>}
    </div>
  );
}

export function CompetitionHistoryModal({
  open,
  onClose,
  university,
  department,
  hintAdmissionType,
}: {
  open: boolean;
  onClose: () => void;
  university: string;
  department: string;
  hintAdmissionType: string;
}) {
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<CompetitionLookupResult | undefined>(undefined);
  const [chosen, setChosen] = useState<CompetitionSeries | null>(null);

  useEffect(() => {
    if (!open) return;
    let active = true;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLoading(true);
    setResult(undefined);
    setChosen(null);
    fetchCompetitionSeries(university, department, hintAdmissionType).then((res) => {
      if (active) {
        setResult(res);
        if (res.kind === "matched") setChosen(res.series);
        setLoading(false);
      }
    });
    return () => {
      active = false;
    };
  }, [open, university, department, hintAdmissionType]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 bg-slate-950/60 backdrop-blur-sm z-[90] flex items-center justify-center p-4" onClick={onClose}>
      <div
        className="bg-white rounded-3xl shadow-2xl max-w-2xl w-full max-h-[85vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 pt-5">
          <h3 className="text-base font-bold text-slate-900 flex items-center gap-1.5">
            <TrendingUp className="w-4 h-4 text-indigo-600" />
            작년 경쟁률
          </h3>
          <button onClick={onClose} className="w-8 h-8 rounded-lg hover:bg-slate-100 flex items-center justify-center text-slate-400">
            <X className="w-4 h-4" />
          </button>
        </div>
        <p className="px-5 pt-1 text-xs text-slate-400">
          {university} · {department}
        </p>

        <div className="p-5">
          {loading && <div className="py-16 text-center text-sm text-slate-400">불러오는 중...</div>}

          {!loading && result?.kind === "none" && (
            <div className="py-16 text-center text-sm text-slate-400">작년 데이터를 찾을 수 없습니다.</div>
          )}

          {!loading && result?.kind === "ambiguous" && !chosen && (
            <div className="space-y-2">
              <p className="text-xs font-bold text-slate-700">
                이름만으로는 전형을 하나로 좁히지 못했어요. 어느 전형인지 골라 주세요.
              </p>
              <div className="space-y-1.5">
                {result.options.map((o, i) => (
                  <button
                    key={`${o.admissionType}-${i}`}
                    type="button"
                    onClick={() => setChosen(o)}
                    className="w-full flex items-center justify-between gap-2 text-left px-3 py-2 bg-slate-50 hover:bg-indigo-50 border border-slate-200 hover:border-indigo-300 rounded-xl transition"
                  >
                    <span className="font-bold text-slate-800 text-xs">{o.admissionType}</span>
                    <span className="shrink-0 text-[11px] font-bold text-indigo-600">선택</span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {!loading && chosen && (
            <div className="space-y-3">
              {chosen.matchLevel === "summary" && (
                <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
                  정확히 일치하는 학과 데이터가 없어, <strong>{chosen.admissionType}</strong> 전형 전체
                  경쟁률로 대신 보여드려요.
                </p>
              )}
              {chosen.matchLevel === "department" && chosen.admissionType !== hintAdmissionType && (
                <p className="text-[11px] text-slate-400">전형: {chosen.admissionType}</p>
              )}
              <CompetitionChart series={chosen} />
            </div>
          )}

          <p className="mt-4 text-[11px] text-slate-400 border-t border-slate-100 pt-3">
            2026학년도(작년) 수시 원서접수 기간 기록입니다. 올해와 다를 수 있습니다.
          </p>
        </div>
      </div>
    </div>
  );
}
