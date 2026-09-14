import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/supabase/require-admin";
import { createAdminClient } from "@/lib/supabase/admin";
import { buildAdmissionCutModel, fetchAdmissionCutoffModelSource } from "@/lib/admission-cut-model";

type IncomingRow = {
  region: string | null;
  university: unknown;
  year: unknown;
  admission_period: string | null;
  track: string | null;
  admission_type: string | null;
  department: unknown;
  humanities_science: string | null;
  enrollment: string | null;
  competition_rate: string | null;
  additional_pass: string | null;
  converted_50: string | null;
  converted_70: string | null;
  max_score: string | null;
  grade_50: string | null;
  grade_70: string | null;
  korean: string | null;
  math: string | null;
  inquiry: string | null;
  average: string | null;
  english: string | null;
  total_applicants: string | null;
  passers: string | null;
  actual_competition_rate: string | null;
  admission_department: string | null;
  sub_category: string | null;
};

/**
 * 입결 엑셀은 브라우저에서 exceljs로 파싱한 뒤 이 라우트로 여러 번(청크 단위) 나눠 올린다.
 * 첫 청크(isFirst)에서만 기존 데이터를 통째로 비우고, 이후 청크는 그대로 추가한다.
 * 마지막 청크(isLast)가 끝나면 합격 가능성 계산기가 읽을 사전 계산 자료도 함께 만든다.
 */
export async function POST(request: Request) {
  const admin = await requireAdmin();
  if (!admin) {
    return NextResponse.json({ error: "권한이 없습니다." }, { status: 403 });
  }

  const body = await request.json().catch(() => null);
  const rows = body?.rows as IncomingRow[] | undefined;
  const isFirst = Boolean(body?.isFirst);
  const isLast = Boolean(body?.isLast);

  if (!Array.isArray(rows) || rows.length === 0) {
    return NextResponse.json({ error: "저장할 데이터가 없습니다." }, { status: 400 });
  }

  const cleaned = [];
  for (const row of rows) {
    const university = typeof row.university === "string" ? row.university.trim() : "";
    const department = typeof row.department === "string" ? row.department.trim() : "";
    const year = Number(row.year);
    if (!university || !department || !Number.isFinite(year)) {
      return NextResponse.json({ error: "행 데이터 형식이 올바르지 않습니다." }, { status: 400 });
    }
    cleaned.push({ ...row, university, department, year });
  }

  const adminClient = createAdminClient();

  if (isFirst) {
    const { error: deleteError } = await adminClient
      .from("admission_cutoffs")
      .delete()
      .neq("id", "00000000-0000-0000-0000-000000000000");
    if (deleteError) {
      return NextResponse.json({ error: "기존 데이터 삭제에 실패했습니다." }, { status: 500 });
    }
    const { error: clearModelError } = await adminClient
      .from("admission_cut_models")
      .delete()
      .eq("id", "current");
    if (clearModelError) {
      return NextResponse.json({ error: "기존 계산 자료 정리에 실패했습니다." }, { status: 500 });
    }
  }

  const { error: insertError } = await adminClient.from("admission_cutoffs").insert(cleaned);
  if (insertError) {
    return NextResponse.json({ error: "저장에 실패했습니다." }, { status: 500 });
  }

  if (isLast) {
    try {
      const sourceRows = await fetchAdmissionCutoffModelSource(adminClient);
      const model = buildAdmissionCutModel(sourceRows);
      const sourceYears = [...new Set(sourceRows.map((row) => row.year))].sort((a, b) => a - b);
      if (model.database.length === 0 || model.bins.length === 0) {
        return NextResponse.json({ error: "계산에 사용할 연속 4개년 교과 입결이 부족합니다." }, { status: 400 });
      }
      const { error: modelError } = await adminClient.from("admission_cut_models").upsert({
        id: "current",
        database: model.database,
        bins: model.bins,
        competition_correction: model.competitionCorrection,
        source_row_count: sourceRows.length,
        source_years: sourceYears,
        built_at: new Date().toISOString(),
      });
      if (modelError) throw modelError;
    } catch (error) {
      console.error("[upload-admission-cutoffs] model build failed:", error);
      return NextResponse.json({ error: "입결은 저장됐지만 계산 자료를 만들지 못했습니다. 파일을 다시 업로드해 주세요." }, { status: 500 });
    }
  }

  return NextResponse.json({ count: cleaned.length });
}
