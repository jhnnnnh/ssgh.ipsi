/**
 * 1회성 스크립트: "대학어디가류" 수시모집 경쟁률 아카이브 엑셀(대학별 시트, 시간대별
 * 지원인원/경쟁률)을 파싱해서 admission_competition_history 테이블에 적재한다.
 * 대학마다 시트 컬럼 구조가 조금씩 달라서(단과대학/캠퍼스/계열 등 계층 컬럼 개수와
 * 이름이 제각각) 컬럼 이름이 아니라 위치 기반으로 파싱한다: 2~6번 컬럼 중 그 행에서
 * 실제로 값이 채워진 가장 오른쪽 칸을 "학과명"으로, 그 왼쪽 칸들은 forward-fill해서
 * "상위 분류"(단과대학/캠퍼스 등)로 취급한다.
 *
 * 사용법: npx tsx scripts/import-competition-history.ts [엑셀파일경로]
 *   (기본 경로: C:\Users\admin\Desktop\2026학년도_수시모집_경쟁률_아카이브.xlsx)
 */
import { config } from "dotenv";
import { createClient } from "@supabase/supabase-js";
import ExcelJS from "exceljs";

config({ path: ".env.local" });

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const FILE = process.argv[2] || "C:\\Users\\admin\\Desktop\\2026학년도_수시모집_경쟁률_아카이브.xlsx";

const HIER_COLS = [2, 3, 4, 5, 6];
const SKIP_RE = /(^|\s)(총계|소계|계)$/;

function cellText(v: ExcelJS.CellValue): string | number | null {
  if (v == null) return null;
  if (typeof v === "object" && "richText" in v) {
    return (v.richText as { text: string }[]).map((r) => r.text).join("");
  }
  if (typeof v === "object" && "text" in v) return String((v as { text: unknown }).text);
  if (typeof v === "string") return v.trim();
  if (typeof v === "number") return v;
  return null;
}

function parseTimestamp(label: string): Date | null {
  if (!label || label === "최종") return null;
  const m = label.match(/(\d{4})년\s*(\d{2})월\s*(\d{2})일\s*(\d{2}):(\d{2})/);
  if (!m) return null;
  const [, y, mo, d, h, mi] = m;
  return new Date(Number(y), Number(mo) - 1, Number(d), Number(h), Number(mi));
}

function parseRatio(v: ExcelJS.CellValue): number | null {
  if (v == null) return null;
  if (typeof v === "number") return v;
  const m = String(v).match(/([\d.]+)\s*:\s*1/);
  return m ? parseFloat(m[1]) : null;
}

type TimeCol = { col: number; label: string; isFinal: boolean; elapsedMin: number | null };
type SeriesPoint = [number | null, number | null, number | null]; // [경과분, 지원인원, 경쟁률]

type Record_ = {
  university: string;
  admission_type: string;
  college: string | null;
  department: string | null;
  enrollment: number | null;
  start_at: string;
  series: SeriesPoint[];
};

function rowKind(ws: ExcelJS.Worksheet, r: number): "END" | "SKIP" | "END_NO_CONSUME" | "DATA" {
  for (const c of HIER_COLS) {
    const v = cellText(ws.getRow(r).getCell(c).value);
    if (v === "총계") return "END";
    if (typeof v === "string" && SKIP_RE.test(v)) return "SKIP";
    if (typeof v === "string" && v.includes("경쟁률 현황")) return "END_NO_CONSUME";
  }
  return "DATA";
}

function buildSeries(ws: ExcelJS.Worksheet, r: number, timeCols: TimeCol[]): SeriesPoint[] {
  const row = ws.getRow(r);
  return timeCols.map((tc) => {
    const applicants = row.getCell(tc.col).value;
    const ratio = parseRatio(row.getCell(tc.col + 1).value);
    return [tc.elapsedMin, typeof applicants === "number" ? applicants : null, ratio];
  });
}

function parseHierarchyBlock(
  ws: ExcelJS.Worksheet,
  startRow: number,
  maxRow: number,
  timeCols: TimeCol[],
): { items: { deepValue: string; college: string | null; enrollment: number | null; series: SeriesPoint[] }[]; nextRow: number } {
  const items: { deepValue: string; college: string | null; enrollment: number | null; series: SeriesPoint[] }[] = [];
  const fill: Record<number, string | null> = { 2: null, 3: null, 4: null, 5: null, 6: null };
  let r = startRow;
  while (r <= maxRow) {
    const kind = rowKind(ws, r);
    if (kind === "END") {
      r++;
      break;
    }
    if (kind === "END_NO_CONSUME") break;
    if (kind === "SKIP") {
      r++;
      continue;
    }
    let deepCol: number | null = null;
    let deepValue: string | null = null;
    for (const c of HIER_COLS) {
      const v = cellText(ws.getRow(r).getCell(c).value);
      if (v != null && !(typeof v === "string" && v.includes("%"))) {
        fill[c] = String(v);
        deepCol = c;
        deepValue = String(v);
      }
    }
    if (deepCol == null || deepValue == null) {
      r++;
      continue;
    }
    const college =
      HIER_COLS.filter((c) => c < deepCol!)
        .map((c) => fill[c])
        .filter(Boolean)
        .join(" / ") || null;
    const enrollment = ws.getRow(r).getCell(7).value;
    items.push({
      deepValue,
      college,
      enrollment: typeof enrollment === "number" ? enrollment : null,
      series: buildSeries(ws, r, timeCols),
    });
    r++;
  }
  return { items, nextRow: r };
}

function parseUniversitySheet(ws: ExcelJS.Worksheet): Record_[] {
  const maxRow = ws.rowCount;
  const university = ws.name;

  const rawTimeCols: { col: number; label: string; isFinal: boolean; ts: Date | null }[] = [];
  for (let c = 9; c <= ws.columnCount; c += 2) {
    const label = cellText(ws.getRow(3).getCell(c).value);
    if (label == null) continue;
    const labelStr = String(label);
    rawTimeCols.push({ col: c, label: labelStr, isFinal: labelStr === "최종", ts: parseTimestamp(labelStr) });
  }
  const real = rawTimeCols.filter((t) => !t.isFinal);
  if (real.length === 0) return [];
  const startTs = real[0].ts!;
  const timeCols: TimeCol[] = rawTimeCols.map((t) => ({
    col: t.col,
    label: t.label,
    isFinal: t.isFinal,
    elapsedMin: t.ts ? Math.round((t.ts.getTime() - startTs.getTime()) / 60000) : null,
  }));

  const records: Record_[] = [];
  let r = 1;
  let foundTypeSummary = false;
  while (r <= maxRow) {
    const t = cellText(ws.getRow(r).getCell(2).value);
    if (t === "전형별 경쟁률 현황") {
      foundTypeSummary = true;
      break;
    }
    r++;
  }

  if (foundTypeSummary) {
    r += 2;
    const { items, nextRow } = parseHierarchyBlock(ws, r, maxRow, timeCols);
    for (const it of items) {
      records.push({
        university,
        admission_type: it.deepValue,
        college: null,
        department: null,
        enrollment: it.enrollment,
        start_at: startTs.toISOString(),
        series: it.series,
      });
    }
    r = nextRow;
  } else {
    r = 1;
    while (r <= maxRow) {
      const t = cellText(ws.getRow(r).getCell(2).value);
      if (t === "총계") break;
      r++;
    }
    if (r > maxRow) return records;
    r++;
  }

  while (r <= maxRow) {
    const title = cellText(ws.getRow(r).getCell(2).value);
    if (title == null || title === "상단으로 이동") break;
    if (typeof title !== "string" || !title.includes("경쟁률 현황")) {
      r++;
      continue;
    }
    const admissionType = title.split("경쟁률 현황")[0].trim();
    r += 2;
    const { items, nextRow } = parseHierarchyBlock(ws, r, maxRow, timeCols);
    for (const it of items) {
      records.push({
        university,
        admission_type: admissionType,
        college: it.college,
        department: it.deepValue,
        enrollment: it.enrollment,
        start_at: startTs.toISOString(),
        series: it.series,
      });
    }
    r = nextRow;
  }

  return records;
}

async function main() {
  if (!url || !serviceKey) {
    throw new Error("NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY가 필요합니다.");
  }
  const admin = createClient(url, serviceKey, { auth: { autoRefreshToken: false, persistSession: false } });

  console.log("엑셀 로딩 중:", FILE);
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(FILE);
  console.log("로딩 완료. 시트 수:", wb.worksheets.length);

  const allRecords: Record_[] = [];
  for (const ws of wb.worksheets) {
    if (ws.name === "개요") continue;
    try {
      const recs = parseUniversitySheet(ws);
      allRecords.push(...recs);
    } catch (e) {
      console.error(`파싱 실패: ${ws.name}`, e);
    }
  }
  console.log("총 파싱 레코드 수:", allRecords.length);

  console.log("기존 데이터 삭제 중...");
  const { error: delError } = await admin.from("admission_competition_history").delete().not("id", "is", null);
  if (delError) throw delError;

  console.log("적재 시작...");
  const CHUNK = 300;
  let inserted = 0;
  for (let i = 0; i < allRecords.length; i += CHUNK) {
    const chunk = allRecords.slice(i, i + CHUNK);
    const { error } = await admin.from("admission_competition_history").insert(chunk);
    if (error) {
      console.error(`청크 ${i}~${i + chunk.length} 삽입 실패:`, error);
      throw error;
    }
    inserted += chunk.length;
    if (inserted % 3000 < CHUNK) console.log(`진행: ${inserted}/${allRecords.length}`);
  }
  console.log("적재 완료:", inserted, "행");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
