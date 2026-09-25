"use client";

import { useEffect, useState } from "react";
import { FileSpreadsheet, ListChecks, Upload } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useToast } from "@/components/providers/ToastProvider";
import { useConfirm } from "@/components/providers/ConfirmProvider";
import {
  AdmissionOfferingParseError,
  parseAdmissionOfferingExcel,
  type ParsedOfferingRow,
} from "@/lib/admission-offering-excel";

// 93개 컬럼(그중 raw jsonb는 전체 원본을 통째로 담아 특히 무겁다)을 한 번에 올리다 보니
// 기존 다른 테이블(26~9열)에서 쓰던 2000행 청크는 요청이 커서 타임아웃이 났다. 500행으로
// 줄이니 안정적으로 끝까지 업로드됐다.
const CHUNK_SIZE = 500;

function useOfferingSummary() {
  const [count, setCount] = useState<number | null>(null);

  const reload = async () => {
    const supabase = createClient();
    const { count: total } = await supabase
      .from("admission_offerings")
      .select("id", { count: "exact", head: true });
    setCount(total ?? 0);
  };

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    reload();
  }, []);

  return { count, reload };
}

async function uploadRows(
  rows: ParsedOfferingRow[],
  onProgress: (done: number, total: number) => void,
): Promise<number> {
  const batchUploadedAt = new Date().toISOString();
  let saved = 0;
  for (let i = 0; i < rows.length; i += CHUNK_SIZE) {
    const chunk = rows.slice(i, i + CHUNK_SIZE);
    const isLast = i + CHUNK_SIZE >= rows.length;
    const res = await fetch("/api/admin/upload-admission-offerings", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ rows: chunk, batchUploadedAt, isLast }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error ?? "업로드에 실패했습니다.");
    saved += data.count as number;
    onProgress(Math.min(i + CHUNK_SIZE, rows.length), rows.length);
  }
  return saved;
}

export function AdmissionOfferingUploadTab() {
  const showToast = useToast();
  const confirm = useConfirm();
  const { count, reload } = useOfferingSummary();
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);

  async function handleFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;

    if (count && count > 0) {
      const ok = await confirm({
        message: `이미 저장된 전형 데이터 ${count.toLocaleString()}건이 있습니다. 새 파일 기준으로 안전하게 교체하시겠습니까?`,
        confirmLabel: "교체하기",
        danger: true,
      });
      if (!ok) return;
    }

    setUploading(true);
    setProgress(null);
    try {
      const { rows, duplicateCodeCount } = await parseAdmissionOfferingExcel(file);
      const saved = await uploadRows(rows, (done, total) => setProgress({ done, total }));
      const dupNote = duplicateCodeCount > 0 ? ` (식별 CODE 중복 ${duplicateCodeCount}건은 마지막 값으로 대체)` : "";
      showToast(`${saved.toLocaleString()}건 저장되었습니다.${dupNote}`, "success");
      await reload();
    } catch (err) {
      if (err instanceof AdmissionOfferingParseError) {
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
          <ListChecks className="w-5 h-5" />
        </div>
        <div>
          <h3 className="font-bold text-slate-900">수시 전형 업로드</h3>
          <p className="text-xs text-slate-400 mt-0.5">
            &ldquo;수시전형모음&rdquo; 엑셀의 &ldquo;전형데이터&rdquo; 시트를 읽어 저장합니다. 식별
            CODE 기준으로 안전하게 교체됩니다.
          </p>
        </div>
      </div>

      <div className="bg-slate-50 border border-slate-200 rounded-2xl px-4 py-3 text-xs text-slate-600">
        {count == null ? (
          "불러오는 중..."
        ) : count === 0 ? (
          "아직 저장된 전형 데이터가 없습니다."
        ) : (
          <>
            현재 저장된 데이터: <span className="font-bold text-slate-800">{count.toLocaleString()}건</span>
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
        <span>식별 CODE·대학명·전형유형 등 93개 컬럼을 가진 &ldquo;전형데이터&rdquo; 시트만 읽습니다.</span>
      </div>
    </div>
  );
}
