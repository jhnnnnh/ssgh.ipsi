"use client";

import { useEffect, useState } from "react";
import { FileSpreadsheet, Trophy, Upload } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useToast } from "@/components/providers/ToastProvider";
import { useConfirm } from "@/components/providers/ConfirmProvider";
import { fetchAllRows, parseSchoolResultsExcel, SchoolResultsParseError } from "@/lib/school-results-excel";

/** 연도별 저장 건수. 1년치가 1~2천 행 수준이라 전체를 받아 세도 충분히 가볍다. */
function useYearCounts() {
  const [counts, setCounts] = useState<Map<number, number> | null>(null);

  const reload = async () => {
    const supabase = createClient();
    const data = await fetchAllRows((from, to) =>
      supabase.from("school_admission_results").select("result_year").order("id").range(from, to),
    ).catch(() => []);
    const map = new Map<number, number>();
    for (const r of data) map.set(r.result_year, (map.get(r.result_year) ?? 0) + 1);
    setCounts(map);
  };

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    reload();
  }, []);

  return { counts, reload };
}

export function SchoolResultsUploadTab() {
  const showToast = useToast();
  const confirm = useConfirm();
  const { counts, reload } = useYearCounts();
  const [uploading, setUploading] = useState(false);
  const [yearText, setYearText] = useState(String(new Date().getFullYear() - 1));

  async function handleFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;

    const year = Number(yearText.trim());
    if (!Number.isInteger(year) || year < 2000 || year > 2100) {
      showToast("연도를 4자리 숫자로 입력해 주세요.", "error");
      return;
    }
    const existing = counts?.get(year) ?? 0;
    if (existing > 0) {
      const ok = await confirm({
        message: `${year}년 결과 ${existing.toLocaleString()}건이 이미 있습니다. 새 파일로 교체하시겠습니까?`,
        confirmLabel: "교체하기",
        danger: true,
      });
      if (!ok) return;
    }

    setUploading(true);
    try {
      const rows = await parseSchoolResultsExcel(file);
      const supabase = createClient();
      const uploadedAt = new Date().toISOString();
      // 새 행을 먼저 넣고 성공한 뒤에만 같은 연도의 이전 행을 지운다. 중간에 실패해도
      // 기존 데이터는 남는다.
      const { error: insertError } = await supabase.from("school_admission_results").insert(
        rows.map((r) => ({
          ...r,
          result_year: year,
          uploaded_at: uploadedAt,
        })),
      );
      if (insertError) throw new Error("저장에 실패했습니다.");
      const { error: pruneError } = await supabase
        .from("school_admission_results")
        .delete()
        .eq("result_year", year)
        .neq("uploaded_at", uploadedAt);
      if (pruneError) throw new Error("이전 데이터 정리에 실패했습니다.");
      showToast(`${year}년 결과 ${rows.length.toLocaleString()}건 저장되었습니다.`, "success");
      await reload();
    } catch (err) {
      showToast(
        err instanceof SchoolResultsParseError || err instanceof Error ? err.message : "업로드에 실패했습니다.",
        "error",
      );
    } finally {
      setUploading(false);
    }
  }

  const years = counts ? [...counts.entries()].sort((a, b) => b[0] - a[0]) : null;

  return (
    <div className="bg-white rounded-3xl p-6 border border-slate-200/80 shadow-sm space-y-5">
      <div className="flex items-start gap-3">
        <div className="w-10 h-10 rounded-xl bg-indigo-50 text-indigo-600 flex items-center justify-center shrink-0">
          <Trophy className="w-5 h-5" />
        </div>
        <div>
          <h3 className="font-bold text-slate-900">우리 학교 수시 결과 업로드</h3>
          <p className="text-xs text-slate-400 mt-0.5">
            학생별 합불 결과 엑셀을 지원 연도 단위로 저장합니다. 반·번호·이름은 저장하지 않습니다.
          </p>
        </div>
      </div>

      <div className="bg-slate-50 border border-slate-200 rounded-2xl px-4 py-3 text-xs text-slate-600">
        {years == null ? (
          "불러오는 중..."
        ) : years.length === 0 ? (
          "아직 저장된 결과가 없습니다."
        ) : (
          <div className="flex flex-wrap gap-x-4 gap-y-1">
            {years.map(([year, n]) => (
              <span key={year}>
                {year}년 <span className="font-bold text-slate-800">{n.toLocaleString()}건</span>
              </span>
            ))}
          </div>
        )}
      </div>

      <label className="flex flex-wrap items-center gap-2 text-xs font-bold text-slate-600">
        지원 연도
        <input
          type="number"
          inputMode="numeric"
          value={yearText}
          onChange={(e) => setYearText(e.target.value)}
          disabled={uploading}
          className="w-24 rounded-lg border border-slate-200 px-2 py-1 text-sm font-normal text-slate-800"
        />
        <span className="font-normal text-slate-400">원서를 접수한 해 (예: 2025년 3학년 결과 → 2025)</span>
      </label>

      <label
        className={`flex items-center justify-center gap-2 border-2 border-dashed rounded-2xl py-8 cursor-pointer transition ${
          uploading
            ? "border-slate-200 bg-slate-50 cursor-not-allowed"
            : "border-indigo-200 hover:border-indigo-400 hover:bg-indigo-50/50"
        }`}
      >
        {uploading ? (
          <p className="text-xs font-bold text-slate-500">업로드 중...</p>
        ) : (
          <div className="flex items-center gap-2 text-indigo-600">
            <Upload className="w-4 h-4" />
            <span className="text-xs font-bold">엑셀 파일(.xlsx)을 선택해 업로드</span>
          </div>
        )}
        <input type="file" accept=".xlsx" disabled={uploading} onChange={handleFileSelect} className="hidden" />
      </label>

      <div className="flex items-start gap-1.5 text-xs text-slate-400">
        <FileSpreadsheet className="w-3.5 h-3.5 shrink-0 mt-0.5" />
        <span>첫 시트 1행에서 대학명·세부유형·모집단위·최종단계·전교과 등의 열을 이름으로 찾아 읽습니다.</span>
      </div>
    </div>
  );
}
