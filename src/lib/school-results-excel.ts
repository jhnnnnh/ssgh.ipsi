import type ExcelJS from "exceljs";
import type { SchoolAdmissionResult } from "@/lib/database.types";

export class SchoolResultsParseError extends Error {}

export type ParsedSchoolResultRow = Omit<SchoolAdmissionResult, "id" | "created_at" | "uploaded_at" | "result_year">;

const REQUIRED_HEADERS = ["대학명", "모집단위", "최종단계"] as const;

function cellToString(v: ExcelJS.CellValue): string | null {
  if (v == null) return null;
  if (typeof v === "object") {
    if ("result" in v) return v.result == null ? null : String(v.result).trim() || null;
    if ("richText" in v)
      return (
        (v as { richText: { text: string }[] }).richText
          .map((p) => p.text)
          .join("")
          .trim() || null
      );
    if ("text" in v) return String((v as { text: unknown }).text).trim() || null;
    return null;
  }
  const s = String(v).trim();
  return s === "" ? null : s;
}

function cellToNumber(v: ExcelJS.CellValue): number | null {
  const s = typeof v === "number" ? String(v) : cellToString(v);
  if (s == null) return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

/**
 * 학교 수시 결과 엑셀(첫 시트, 1행 헤더)을 읽는다. 열 순서가 파일마다 조금 달라도 되도록
 * 헤더 이름으로 열을 찾는다. 반·번호·이름 열은 읽지 않는다(통계에 필요 없는 개인정보).
 * "최초후보순위"는 병합 헤더 두 칸(유형·순위) 중 뒤 칸이 실제 순위 숫자다.
 */
export async function parseSchoolResultsExcel(file: File): Promise<ParsedSchoolResultRow[]> {
  const ExcelJSLib = (await import("exceljs")).default;
  const workbook = new ExcelJSLib.Workbook();
  await workbook.xlsx.load(await file.arrayBuffer());
  const sheet = workbook.worksheets[0];
  if (!sheet) throw new SchoolResultsParseError("시트를 찾을 수 없습니다.");

  const headers: (string | null)[] = [];
  sheet.getRow(1).eachCell({ includeEmpty: true }, (cell, col) => {
    headers[col] = cellToString(cell.value);
  });
  const col = (name: string) => headers.indexOf(name);
  for (const name of REQUIRED_HEADERS) {
    if (col(name) < 0) {
      throw new SchoolResultsParseError(`1행에서 "${name}" 열을 찾을 수 없습니다. 파일 형식을 확인해 주세요.`);
    }
  }
  const waitlistCol = headers.lastIndexOf("최초후보순위");

  const get = (row: ExcelJS.Row, name: string) => (col(name) < 0 ? null : cellToString(row.getCell(col(name)).value));
  const getNum = (row: ExcelJS.Row, name: string) =>
    col(name) < 0 ? null : cellToNumber(row.getCell(col(name)).value);

  const rows: ParsedSchoolResultRow[] = [];
  sheet.eachRow((row, rowNumber) => {
    if (rowNumber === 1) return;
    const university = get(row, "대학명");
    const department = get(row, "모집단위");
    if (!university || !department) return;
    const enrollment = getNum(row, "모집인원");
    rows.push({
      region: get(row, "지역"),
      university,
      admission_type: get(row, "세부유형"),
      track: get(row, "계열"),
      department,
      // 원본에 음수(예: -20) 같은 잘못된 모집인원이 섞여 있어 걸러낸다.
      enrollment: enrollment != null && enrollment > 0 ? Math.round(enrollment) : null,
      final_stage: get(row, "최종단계"),
      fail_reason: get(row, "불합격사유"),
      waitlist_rank: waitlistCol < 0 ? null : cellToNumber(row.getCell(waitlistCol).value),
      gpa: getNum(row, "전교과"),
    });
  });
  if (rows.length === 0) throw new SchoolResultsParseError("읽을 수 있는 결과 행이 없습니다.");
  return rows;
}

/**
 * 조회 결과를 전부 읽는다. Supabase는 한 번에 최대 1,000행만 돌려줘서 1년치 결과(1~2천 행)나
 * 학년 전체 원서 카드도 잘리므로 1,000행씩 나눠 읽는다.
 */
export async function fetchAllRows<T>(
  fetchPage: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: unknown }>,
): Promise<T[]> {
  const PAGE = 1000;
  const all: T[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await fetchPage(from, from + PAGE - 1);
    if (error) throw error;
    all.push(...(data ?? []));
    if (!data || data.length < PAGE) return all;
  }
}
