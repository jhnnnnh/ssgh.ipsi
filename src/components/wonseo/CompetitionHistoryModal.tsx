"use client";

import { useEffect, useState } from "react";
import { X, TrendingUp } from "lucide-react";
import {
  fetchCompetitionSeries,
  currentElapsedMinutes,
  formatElapsedMinutes,
  type CompetitionSeries,
} from "@/lib/admission-competition-lookup";

const CHART_W = 640;
const CHART_H = 280;
const PAD_L = 44;
const PAD_R = 16;
const PAD_T = 16;
const PAD_B = 32;

function formatDay(minutes: number): string {
  const days = Math.floor(minutes / (24 * 60));
  return `${days}일`;
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
  const [data, setData] = useState<CompetitionSeries | null | undefined>(undefined);

  useEffect(() => {
    if (!open) return;
    let active = true;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLoading(true);
    setData(undefined);
    fetchCompetitionSeries(university, department, hintAdmissionType).then((res) => {
      if (active) {
        setData(res);
        setLoading(false);
      }
    });
    return () => {
      active = false;
    };
  }, [open, university, department, hintAdmissionType]);

  if (!open) return null;

  const realPoints = (data?.points ?? []).filter(
    (p): p is { elapsedMin: number; applicants: number | null; ratio: number } =>
      p.elapsedMin != null && p.ratio != null,
  );
  const finalPoint = data?.points.find(
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

  const nowElapsed = data ? currentElapsedMinutes(data.startAt) : null;
  const showNowMarker = nowElapsed != null && nowElapsed >= 0 && nowElapsed <= maxElapsed;

  return (
    <div className="fixed inset-0 bg-slate-950/60 backdrop-blur-sm z-[90] flex items-center justify-center p-4" onClick={onClose}>
      <div
        className="bg-white rounded-3xl shadow-2xl max-w-2xl w-full max-h-[85vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 pt-5">
          <h3 className="text-base font-bold text-slate-900 flex items-center gap-1.5">
            <TrendingUp className="w-4 h-4 text-indigo-600" />
            작년 이맘때 경쟁률
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

          {!loading && data === null && (
            <div className="py-16 text-center text-sm text-slate-400">작년 데이터를 찾을 수 없습니다.</div>
          )}

          {!loading && data && (
            <div className="space-y-3">
              {data.matchLevel === "summary" && (
                <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
                  정확히 일치하는 학과 데이터가 없어, <strong>{data.admissionType}</strong> 전형 전체
                  경쟁률로 대신 보여드려요.
                </p>
              )}
              {data.matchLevel === "department" && data.admissionType !== hintAdmissionType && (
                <p className="text-[11px] text-slate-400">전형: {data.admissionType}</p>
              )}

              <svg viewBox={`0 0 ${CHART_W} ${CHART_H}`} className="w-full h-auto">
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
                {/* x축 라벨(일 단위) */}
                {Array.from({ length: Math.floor(maxElapsed / (24 * 60)) + 1 }, (_, d) => d * 24 * 60).map((m) => (
                  <text key={m} x={x(m)} y={CHART_H - PAD_B + 16} textAnchor="middle" fontSize={10} fill="#94a3b8">
                    {formatDay(m)}
                  </text>
                ))}

                {linePath && <path d={linePath} fill="none" stroke="#4f46e5" strokeWidth={2} />}

                {showNowMarker && nowElapsed != null && (
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
              </svg>

              {finalPoint && (
                <p className="text-xs text-slate-500">
                  작년 최종 경쟁률: <strong className="text-slate-800">{finalPoint.ratio.toFixed(2)} : 1</strong>
                </p>
              )}
              {showNowMarker && nowElapsed != null && (
                <p className="text-xs text-slate-500">지금 시점(작년 기준 추정): {formatElapsedMinutes(nowElapsed)}</p>
              )}
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
