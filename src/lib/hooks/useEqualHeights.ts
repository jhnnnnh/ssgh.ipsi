"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";

/**
 * 그리드 안의 카드 높이를 목록 전체에서 가장 긴 카드에 맞춰 통일한다.
 * (같은 행뿐 아니라 다른 행에 있는 카드끼리도 전부 동일해진다.)
 *
 * min-height는 카드 루트(ref)에 돌려주지만, 실제 콘텐츠 높이는 그 min-height의
 * 영향을 받지 않는 안쪽 요소(measureRef)로 잰다. 카드 루트 자신을 재면 한번 커진
 * min-height가 내려갈 상황에서도 "내용이 줄어든 걸" 영영 감지하지 못한다(루트가
 * 이미 min-height로 떠받쳐져 있어 실제로 안 줄어드는 것처럼 보이기 때문).
 *
 * 화면이 1열(모바일)로 좁아지면 통일을 끄고 각 카드가 자기 내용 길이대로
 * 자연스러운 높이를 갖도록 한다.
 *
 * @param resetKey - 카드 개수뿐 아니라 "어떤 카드들이 표시되는지"가 바뀔 때마다
 *   (예: 카드 id 목록을 join한 문자열) 새로 넘겨줘야 옵저버가 새 DOM으로 재연결된다.
 *   카드 개수는 같은데 다른 목록으로 바뀌는 경우(예: 교사가 다른 학생을 선택)를
 *   놓치지 않기 위함이다.
 * @param multiColumnBreakpointPx - 이 너비 이상일 때만("1열이 아닐 때만") 높이를
 *   통일한다. 프로젝트의 Tailwind `md` 브레이크포인트(768px)에 맞춘 기본값.
 */
export function useEqualHeights(resetKey: string, count: number, multiColumnBreakpointPx = 768) {
  const [maxHeight, setMaxHeight] = useState<number | undefined>(undefined);
  const [multiColumn, setMultiColumn] = useState(false);
  const refs = useRef<(HTMLElement | null)[]>([]);
  const heights = useRef<number[]>([]);

  const setRef = useCallback(
    (index: number) => (el: HTMLElement | null) => {
      refs.current[index] = el;
    },
    [],
  );

  useEffect(() => {
    const mq = window.matchMedia(`(min-width: ${multiColumnBreakpointPx}px)`);
    const update = () => setMultiColumn(mq.matches);
    update();
    mq.addEventListener("change", update);
    return () => mq.removeEventListener("change", update);
  }, [multiColumnBreakpointPx]);

  useEffect(() => {
    heights.current = new Array(count).fill(0);
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setMaxHeight(undefined);
  }, [resetKey, count]);

  // 화면에 그려지기 전에(useLayoutEffect) 실제 콘텐츠 높이를 다시 재서 필요하면 바로
  // 보정한다. min-height가 걸린 카드 자신이 아니라, 그 영향을 받지 않는 내부 콘텐츠
  // 요소(measureRef)를 재기 때문에 "내용이 줄어들어도 예전에 정해진 min-height 때문에
  // 줄어든 걸 감지하지 못하는" 문제가 없다. ResizeObserver(아래)는 리액트 렌더와
  // 무관한 변화(이미지 로드 등 외부 요인)까지 마저 잡아내는 보조 수단이다.
  // 의도적으로 매 렌더마다 다시 잰다(카드 콘텐츠가 바뀌었는지 알려줄 별도의
  // dependency 값이 없다). prev===next면 상태를 바꾸지 않으므로 무한 루프로
  // 이어지지 않는다.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useLayoutEffect(() => {
    if (!multiColumn || count === 0) return;
    const current = refs.current.slice(0, count);
    if (current.some((el) => !el)) return;
    const measured = current.map((el) => el!.getBoundingClientRect().height);
    heights.current = measured;
    const next = Math.max(...measured);
    setMaxHeight((prev) => (prev === next ? prev : next));
  });

  useEffect(() => {
    if (count === 0) return;

    const elToIndex = new Map<Element, number>();
    const ro = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const i = elToIndex.get(entry.target);
        if (i !== undefined) heights.current[i] = entry.contentRect.height;
      }
      setMaxHeight((prev) => {
        const next = Math.max(...heights.current);
        return prev === next ? prev : next;
      });
    });

    refs.current.slice(0, count).forEach((el, i) => {
      if (!el) return;
      elToIndex.set(el, i);
      ro.observe(el);
    });

    return () => ro.disconnect();
  }, [resetKey, count]);

  return { setRef, maxHeight: multiColumn ? maxHeight : undefined };
}
