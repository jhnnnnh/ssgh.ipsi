"use client";

import { useEffect, useState } from "react";
import { Database, FileSpreadsheet, Upload } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useToast } from "@/components/providers/ToastProvider";
import { useConfirm } from "@/components/providers/ConfirmProvider";
import {
  AdmissionCutoffParseError,
  parseAdmissionCutoffExcel,
  type ParsedAdmissionCutoffRow,
} from "@/lib/admission-cutoff-excel";

const CHUNK_SIZE = 2000;

function useCutoffSummary() {
  const [count, setCount] = useState<number | null>(null);
  const [years, setYears] = useState<number[]>([]);

  const reload = async () => {
    const supabase = createClient();
    const [{ count: total }, { data: yearRows }] = await Promise.all([
      supabase.from("admission_cutoffs").select("id", { count: "exact", head: true }),
      supabase.from("admission_cutoffs").select("year").order("year", { ascending: false }),
    ]);
    setCount(total ?? 0);
    setYears([...new Set((yearRows ?? []).map((r) => r.year))]);
  };

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    reload();
  }, []);

  return { count, years, reload };
}

async function uploadRows(
  rows: ParsedAdmissionCutoffRow[],
  onProgress: (done: number, total: number) => void,
): Promise<number> {
  let inserted = 0;
  for (let i = 0; i < rows.length; i += CHUNK_SIZE) {
    const chunk = rows.slice(i, i + CHUNK_SIZE);
    const res = await fetch("/api/admin/upload-admission-cutoffs", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ rows: chunk, isFirst: i === 0, isLast: i + CHUNK_SIZE >= rows.length }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error ?? "업로드에 실패했습니다.");
    inserted += data.count as number;
    onProgress(Math.min(i + CHUNK_SIZE, rows.length), rows.length);
  }
  return inserted;
}

export function AdmissionCutoffUploadTab() {
  const showToast = useToast();
  const confirm = useConfirm();
  const { count, years, reload } = useCutoffSummary();
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);

  async function handleFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;

    if (count && count > 0) {
      const ok = await confirm({
        message: `이미 저장된 입결 데이터 ${count.toLocaleString()}건이 있습니다. 새 파일로 전부 교체하시겠습니까?`,
        confirmLabel: "교체하기",
        danger: true,
      });
      if (!ok) return;
    }

    setUploading(true);
    setProgress(null);
    try {
      const rows = await parseAdmissionCutoffExcel(file);
      const inserted = await uploadRows(rows, (done, total) => setProgress({ done, total }));
      showToast(`${inserted.toLocaleString()}건 저장되었습니다.`, "success");
      await reload();
    } catch (err) {
      if (err instanceof AdmissionCutoffParseError) {
        showToast(err.message, "error");
      } else {
        showToast(err instanceof Error ? err.message : "업로드에 실패했습니다.", "error");
      }
    } finally {
      setUploading(false);
      setProgress(null);
    }
  }

  return (
    <div className="bg-white rounded-3xl p-6 border border-slate-200/80 shadow-sm space-y-5">
      <div className="flex items-start gap-3">
        <div className="w-10 h-10 rounded-xl bg-indigo-50 text-indigo-600 flex items-center justify-center shrink-0">
          <Database className="w-5 h-5" />
        </div>
        <div>
          <h3 className="font-bold text-slate-900">입결 데이터 업로드</h3>
          <p className="text-xs text-slate-400 mt-0.5">
            &ldquo;대학어디가&rdquo; 형식 엑셀의 &ldquo;대학자료&rdquo; 시트를 읽어 저장합니다. 새로
            업로드하면 기존 데이터는 전부 교체됩니다.
          </p>
        </div>
      </div>

      <div className="bg-slate-50 border border-slate-200 rounded-2xl px-4 py-3 text-xs text-slate-600">
        {count == null ? (
          "불러오는 중..."
        ) : count === 0 ? (
          "아직 저장된 입결 데이터가 없습니다."
        ) : (
          <>
            현재 저장된 데이터: <span className="font-bold text-slate-800">{count.toLocaleString()}건</span>
            {years.length > 0 && (
              <span className="text-slate-400"> · {years.slice(0, 6).join(", ")}학년도</span>
            )}
          </>
        )}
      </div>

      <label
        className={`flex items-center justify-center gap-2 border-2 border-dashed rounded-2xl py-8 cursor-pointer transition ${
          uploading
            ? "border-slate-200 bg-slate-50 cursor-not-allowed"
            : "border-indigo-200 hover:border-indigo-400 hover:bg-indigo-50/50"
        }`}
      >
        {uploading ? (
          <div className="text-center space-y-1">
            <p className="text-xs font-bold text-slate-500">
              업로드 중{progress ? ` (${progress.done.toLocaleString()} / ${progress.total.toLocaleString()})` : "..."}
            </p>
          </div>
        ) : (
          <div className="flex items-center gap-2 text-indigo-600">
            <Upload className="w-4 h-4" />
            <span className="text-xs font-bold">엑셀 파일(.xlsx)을 선택해 업로드</span>
          </div>
        )}
        <input
          type="file"
          accept=".xlsx"
          disabled={uploading}
          onChange={handleFileSelect}
          className="hidden"
        />
      </label>

      <div className="flex items-start gap-1.5 text-xs text-slate-400">
        <FileSpreadsheet className="w-3.5 h-3.5 shrink-0 mt-0.5" />
        <span>지역·대학·연도·수시/정시·교과/종합·전형·학과 등 26개 컬럼을 가진 대학자료 시트만 읽습니다.</span>
      </div>
    </div>
  );
}
