"use client";

import { useEffect, useRef, useState } from "react";
import { AlertTriangle, ShieldAlert } from "lucide-react";
import { Card } from "@/components/ui/Card";

/**
 * "합격 확률 추정" 기능을 처음 쓰기 전에 반드시 통과해야 하는 동의 화면. 유의사항을
 * 끝까지 스크롤해서 읽기 전에는 동의 버튼 자체가 비활성 상태다 — 체크박스만 누르고
 * 넘어가는 걸 막기 위한 최소한의 장치다.
 *
 * 학생 화면에서는 동의 버튼이 2개다 — 유의사항 자체에 대한 동의와, "결과가 실제와
 * 달라도 담당 교사에게 책임을 묻지 않는다"는 별도 다짐을 분리해 각각 명시적으로
 * 눌러야 한다.
 */
export function AdmissionProbabilityConsentGate({
  onAgree,
  agreeing,
  audience,
}: {
  onAgree: () => void;
  agreeing: boolean;
  audience: "teacher" | "student";
}) {
  const [scrolledToEnd, setScrolledToEnd] = useState(false);
  const [mainAgreed, setMainAgreed] = useState(false);
  const boxRef = useRef<HTMLDivElement>(null);

  // 화면이 넓거나 글자 크기 설정에 따라 유의사항이 박스 안에 다 들어가서 애초에 스크롤할
  // 게 없는 경우가 있다 — 그러면 "끝까지 스크롤"이 영영 발생하지 않아 동의 버튼이 계속
  // 비활성 상태로 남는다. 그런 경우는 이미 전부 보이는 것이므로 바로 동의 가능 처리한다.
  useEffect(() => {
    const el = boxRef.current;
    if (!el) return;
    if (el.scrollHeight <= el.clientHeight + 8) setScrolledToEnd(true);
  }, []);

  function handleScroll() {
    const el = boxRef.current;
    if (!el) return;
    if (el.scrollTop + el.clientHeight >= el.scrollHeight - 8) setScrolledToEnd(true);
  }

  function handleMainAgree() {
    if (audience === "teacher") {
      onAgree();
      return;
    }
    setMainAgreed(true);
  }

  return (
    <Card className="space-y-4">
      <div className="flex items-start gap-2.5">
        <div className="w-9 h-9 rounded-xl bg-rose-50 text-rose-600 flex items-center justify-center shrink-0">
          <ShieldAlert className="w-5 h-5" />
        </div>
        <div>
          <h3 className="text-sm font-bold text-slate-900">먼저 읽어주세요</h3>
          <p className="text-xs text-slate-500 mt-0.5">
            이 기능은 처음 한 번, 아래 유의사항을 끝까지 읽고 동의해야 사용할 수 있어요.
          </p>
        </div>
      </div>

      <div
        ref={boxRef}
        onScroll={handleScroll}
        className="border border-rose-200 bg-rose-50/40 rounded-2xl p-4 max-h-80 overflow-y-auto text-xs leading-relaxed text-slate-700 space-y-3"
      >
        <p className="font-bold text-rose-700 flex items-center gap-1.5">
          <AlertTriangle className="w-3.5 h-3.5" />
          이 기능이 보여주는 숫자는 &ldquo;합격 확률&rdquo;이 아니라 통계적 추정치입니다.
        </p>
        <p>
          이 도구는 최근 몇 년간의 실제 입결 데이터를 바탕으로, 조건이 비슷한 과거 사례들을 참고해
          통계적으로 계산한 값입니다.
        </p>
        <ul className="list-disc pl-4 space-y-1.5">
          <li>
            <strong>일부 계산은 소수 표본으로 보정된 근사치입니다.</strong> 학생부 교과 전형에 한정된
            모델이며, 학생부종합·논술·실기 등 정성평가가 섞인 전형에는 그대로 적용할 수 없습니다.
          </li>
          <li>
            <strong>실제 합격을 보장하지 않습니다.</strong> 표시되는 확률은 과거 패턴이 올해도 반복된다는
            가정 아래의 추정치일 뿐이며, 실제 결과는 그 해의 지원 동향 등 예측 불가능한 요인에 따라 크게
            달라질 수 있습니다.
          </li>
          <li>
            <strong>입력 데이터 정확도에 그대로 좌우됩니다.</strong> 입결 컷·모집인원·충원인원을 잘못 입력하면
            결과도 그만큼 부정확해집니다.
          </li>
          <li>
            <strong>이 숫자 하나로 수시 지원 전략(6장)을 결정하면 안 됩니다.</strong>{" "}
            {audience === "teacher"
              ? "반드시 입학처 공식 모집요강, 최근 입결 원자료, 담임·진학 교사의 종합적인 상담을 함께 참고해야 합니다."
              : "반드시 입학처 공식 모집요강, 최근 입결 원자료도 함께 확인해야 합니다."}
          </li>
          {audience === "teacher" ? (
            <li>
              <strong>학생·학부모에게 전달할 때는 그 자리에서 반드시 이 한계를 함께 설명해 주세요.</strong>{" "}
              숫자만 먼저 눈에 들어오면 &ldquo;확정된 확률&rdquo;로 오해하기 쉽습니다.
            </li>
          ) : (
            <li>
              <strong>이 숫자만 보고 지원 여부를 판단하지 마세요.</strong> 궁금한 점이나 애매한 결과는
              담임·진학 선생님과 함께 확인해 주세요.
            </li>
          )}
        </ul>
        <p className="text-slate-400">끝까지 스크롤하면 아래 동의 버튼이 활성화됩니다.</p>
      </div>

      <button
        type="button"
        disabled={!scrolledToEnd || mainAgreed || agreeing}
        onClick={handleMainAgree}
        className="w-full py-3 bg-rose-600 hover:bg-rose-700 disabled:bg-slate-200 disabled:text-slate-400 disabled:cursor-not-allowed text-white rounded-xl text-sm font-bold transition"
      >
        {mainAgreed
          ? "✓ 동의함"
          : scrolledToEnd
            ? audience === "teacher"
              ? agreeing
                ? "처리 중..."
                : "위 유의사항을 모두 읽었으며, 참고용 통계 추정치일 뿐 합격을 보장하지 않는다는 점에 동의합니다"
              : "위 유의사항을 모두 읽었으며, 참고용 통계 추정치일 뿐 합격을 보장하지 않는다는 점에 동의합니다"
            : "유의사항을 끝까지 읽어야 동의할 수 있어요"}
      </button>

      {audience === "student" && (
        <button
          type="button"
          disabled={!mainAgreed || agreeing}
          onClick={onAgree}
          className="w-full py-3 bg-rose-600 hover:bg-rose-700 disabled:bg-slate-200 disabled:text-slate-400 disabled:cursor-not-allowed text-white rounded-xl text-sm font-bold transition"
        >
          {agreeing ? "처리 중..." : "결과를 맞추지 못하더라도 양진혁T에게 따지지 않겠습니다"}
        </button>
      )}
    </Card>
  );
}
