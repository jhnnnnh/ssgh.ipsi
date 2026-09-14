import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient as createServerClient } from "@/lib/supabase/server";

const NOT_READY_MESSAGE = "입결 데이터가 아직 준비되지 않았습니다. 관리자에게 문의하세요.";

/**
 * 계산기는 원본 입결을 매번 읽지 않는다. 관리자가 입결 파일 업로드를 끝낼 때 만들어 둔
 * 계산용 숫자 목록 한 건만 반환한다. 서비스 역할 클라이언트는 RLS를 우회하므로, 그 전에
 * 반드시 로그인 여부를 확인한다.
 */
export async function GET() {
  const sessionClient = await createServerClient();
  const {
    data: { user },
  } = await sessionClient.auth.getUser();
  if (!user) return NextResponse.json({ error: "권한이 없습니다." }, { status: 403 });

  const adminClient = createAdminClient();
  const { data: model, error } = await adminClient
    .from("admission_cut_models")
    .select("database, bins, competition_correction")
    .eq("id", "current")
    .maybeSingle();
  if (error) {
    console.error("[admission-cut-model] model read failed:", error);
    return NextResponse.json({ error: "계산 자료를 불러오지 못했습니다. 잠시 후 다시 시도해 주세요." }, { status: 500 });
  }
  if (!model || model.database.length === 0 || model.bins.length === 0) {
    return NextResponse.json({ error: NOT_READY_MESSAGE }, { status: 503 });
  }

  return NextResponse.json(
    { database: model.database, bins: model.bins, competitionCorrection: model.competition_correction },
    { headers: { "Cache-Control": "private, max-age=600" } },
  );
}
