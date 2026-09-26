/**
 * 수능 최저학력기준 문구(이투스 전형데이터 형식)를 해석해 모의고사 등급으로 충족 여부를 판정한다.
 * 예: "[수능 4개 영역 필수 응시] 국, 수, 영, 탐(사/과)(1과목) 중 수학 포함 2개 영역 합 6이내, 한국사 4이내
 * (수(확통) 선택시 1등급 하향 적용)". 해석하지 못한 조건은 판정에 넣지 않고 caveats로 돌려준다.
 */

export type MathSubject = "확통" | "미적" | "기하";
export type InquiryType = "사" | "과";

export type MockGrades = {
  korean: number | null;
  math: number | null;
  mathSubject: MathSubject;
  english: number | null;
  inquiry1: number | null;
  inquiry2: number | null;
  inquiryType: InquiryType;
  history: number | null;
};

type AreaKey = "ko" | "ma" | "en" | "t" | "t1" | "t2" | "hi";

type AreaSpec = {
  key: AreaKey;
  /** 수(미적/기하)처럼 허용 과목이 정해진 경우. */
  mathSubjects?: MathSubject[];
  /** 탐(과)처럼 허용 탐구 종류가 정해진 경우. */
  inquiryTypes?: InquiryType[];
  /** 탐구 1과목(좋은 쪽) 또는 2과목 평균. */
  inquiryMode?: "best" | "avg";
};

type Rule = {
  areas: AreaSpec[];
  /** null이면 나열된 영역 전부. */
  count: number | null;
  agg: "sum" | "avg" | "each";
  limit: number;
  include: { anyOf: AreaKey[] } | { allOf: AreaKey[] } | null;
  extras: { key: AreaKey; limit: number }[];
};

export type MinimumVerdict =
  | { status: "none" }
  | { status: "unknown"; reason: string }
  | { status: "missing"; detail: string; caveats: string[] }
  | { status: "pass" | "fail"; detail: string; caveats: string[] };

const NAME_TO_KEY: Record<string, AreaKey> = {
  국: "ko",
  국어: "ko",
  수: "ma",
  수학: "ma",
  영: "en",
  영어: "en",
  한국사: "hi",
};

const KEY_LABEL: Record<AreaKey, string> = {
  ko: "국",
  ma: "수",
  en: "영",
  t: "탐",
  t1: "탐1",
  t2: "탐2",
  hi: "한국사",
};

function inquiryTypesOf(s: string | undefined): InquiryType[] | undefined {
  if (!s || s === "사/과") return undefined;
  if (s === "과" || s === "과/직") return ["과"];
  if (s === "사") return ["사"];
  return undefined;
}

function parseArea(token: string): AreaSpec | null {
  const t = token.trim();
  if (t === "국" || t === "영" || t === "한국사") return { key: NAME_TO_KEY[t] };
  const math = t.match(/^수(?:\((미적\/기하|미적|확통)\))?$/);
  if (math) {
    const subjects: MathSubject[] | undefined =
      math[1] === "미적/기하"
        ? ["미적", "기하"]
        : math[1] === "미적"
          ? ["미적"]
          : math[1] === "확통"
            ? ["확통"]
            : undefined;
    return { key: "ma", mathSubjects: subjects };
  }
  const inquiry = t.match(/^탐(?:\(([^)]*)\))?\((1과목|2과목평균)\)$/);
  if (inquiry) {
    return {
      key: "t",
      inquiryTypes: inquiryTypesOf(inquiry[1]),
      inquiryMode: inquiry[2] === "1과목" ? "best" : "avg",
    };
  }
  const split = t.match(/^탐([12])\(([^)]*)\)$/) ?? t.match(/^과탐([12])$/);
  if (split) {
    return {
      key: split[1] === "1" ? "t1" : "t2",
      inquiryTypes: t.startsWith("과탐") ? ["과"] : inquiryTypesOf(split[2]),
    };
  }
  return null;
}

function parseInclude(s: string): Rule["include"] | null {
  const toKey = (name: string): AreaKey | null => {
    const n = name.trim();
    if (n.startsWith("탐(")) return "t";
    return NAME_TO_KEY[n] ?? null;
  };
  const parts = s.includes(" 또는 ") ? s.split(" 또는 ") : s.split(/과 |, /);
  const keys = parts.map(toKey);
  if (keys.some((k) => k == null)) return null;
  return s.includes(" 또는 ") ? { anyOf: keys as AreaKey[] } : { allOf: keys as AreaKey[] };
}

/** 괄호 밖의 구분자로만 자른다. */
function splitTopLevel(s: string, sep: RegExp): string[] {
  const out: string[] = [];
  let depth = 0;
  let last = 0;
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (ch === "(") depth++;
    else if (ch === ")") depth--;
    else if (depth === 0) {
      const m = s.slice(i).match(sep);
      if (m && m.index === 0) {
        out.push(s.slice(last, i));
        i += m[0].length - 1;
        last = i + 1;
      }
    }
  }
  out.push(s.slice(last));
  return out;
}

type ParsedAlternative = { rule: Rule; notes: string[] };

function parseAlternative(text: string, previousAreas: AreaSpec[] | null): ParsedAlternative | null {
  let s = text.trim();
  // 끝의 (…) 괄호 묶음은 부가 조건(notes)이다.
  const notes: string[] = [];
  for (;;) {
    const m = s.match(/\s*\(([^()]*(?:\([^()]*\)[^()]*)*)\)$/);
    if (!m || m.index == null) break;
    // 영역 목록 자체의 괄호(예: "탐(사/과)(1과목)")는 뒤에 "이내"/"등급" 문구가 먼저 오므로 여기서 걸리지 않는다.
    notes.unshift(...splitTopLevel(m[1], /^, /).map((n) => n.trim()));
    s = s.slice(0, m.index).trim();
  }

  // "영역 목록 중 …" / "영역 목록 영역 …" / 목록 없이 "1개 영역 …"(또는 뒤 대안)
  let areas: AreaSpec[] | null = previousAreas;
  let rest = s;
  const listEnd = s.search(/ 중 | 영역 /);
  if (listEnd > 0 && !/^(?:[^,중]+ 포함 )?\d개 영역/.test(s)) {
    const parsed = splitTopLevel(s.slice(0, listEnd), /^, /).map(parseArea);
    if (parsed.some((a) => a == null)) return null;
    areas = parsed as AreaSpec[];
    rest = s.slice(listEnd);
  } else {
    rest = ` 중 ${s}`;
  }
  if (!areas) return null;

  let count: number | null;
  let agg: Rule["agg"];
  let limit: number;
  let include: Rule["include"] = null;
  let m = rest.match(/^ 중 (?:(.+?) 포함 )?(\d)개 영역 (?:등급 )?(합|평균|각)? ?(\d+)(이내|등급)/);
  if (m) {
    if (m[1]) {
      include = parseInclude(m[1]);
      if (!include) return null;
    }
    count = Number(m[2]);
    limit = Number(m[4]);
    agg = m[3] === "합" ? "sum" : m[3] === "평균" ? "avg" : "each";
    if (!m[3] && m[5] === "이내" && count > 1) return null;
  } else {
    m = rest.match(/^ 영역 (합|각) (\d+)이내/);
    if (!m) return null;
    count = null;
    agg = m[1] === "합" ? "sum" : "each";
    limit = Number(m[2]);
  }
  rest = rest.slice(m[0].length);

  const extras: Rule["extras"] = [];
  for (;;) {
    const e = rest.match(/^, (영어|한국사|수학) (\d)이내/);
    if (!e) break;
    extras.push({ key: NAME_TO_KEY[e[1]], limit: Number(e[2]) });
    rest = rest.slice(e[0].length);
  }
  if (rest.trim() !== "") return null;
  return { rule: { areas, count, agg, limit, include, extras }, notes };
}

export function parseMinimumStandard(text: string): ParsedAlternative[] | null {
  const body = text.replace(/^\[[^\]]*\]\s*/, "");
  // "또는" 중에서 "국어 또는 수학 포함"처럼 조건 안의 또는이 아니라, 앞 조건("…이내"/"…등급")이
  // 끝난 뒤 새 대안을 여는 또는만 자른다.
  const parts = splitTopLevel(body.replace(/(이내|등급) 또는 /g, "$1\u0000"), /^\u0000/);
  const alts: ParsedAlternative[] = [];
  let prevAreas: AreaSpec[] | null = null;
  for (const part of parts) {
    const alt = parseAlternative(part, prevAreas);
    if (!alt) return null;
    alts.push(alt);
    prevAreas = alt.rule.areas;
  }
  return alts;
}

function combinations<T>(items: T[], k: number): T[][] {
  if (k === 0) return [[]];
  if (items.length < k) return [];
  const [first, ...rest] = items;
  return [...combinations(rest, k - 1).map((c) => [first, ...c]), ...combinations(rest, k)];
}

type Adjust = {
  mathDelta: number;
  englishTwoAsOne: boolean;
  limitOverride: number | null;
  inquiryRound: "floor" | "round" | "ceil" | null;
  caveats: string[];
};

function applyNotes(notes: string[], g: MockGrades): Adjust {
  const adj: Adjust = {
    mathDelta: 0,
    englishTwoAsOne: false,
    limitOverride: null,
    inquiryRound: null,
    caveats: [],
  };
  const isAdvancedMath = g.mathSubject === "미적" || g.mathSubject === "기하";
  for (const note of notes) {
    let m: RegExpMatchArray | null;
    if (/탐구 소수점 절사/.test(note)) adj.inquiryRound = "floor";
    else if (/탐구 소수점 반올림/.test(note)) adj.inquiryRound = "round";
    else if (/소수점 첫째자리 올림/.test(note)) adj.inquiryRound = "ceil";
    else if ((m = note.match(/^수\(확통\) 선택시 (\d)등급 하향( 적용)?$/))) {
      if (g.mathSubject === "확통") adj.mathDelta += Number(m[1]);
    } else if ((m = note.match(/^수\(미적\/기하\) 선택시 (\d)등급 상향$/))) {
      if (isAdvancedMath) adj.mathDelta -= Number(m[1]);
    } else if ((m = note.match(/^수\(미적\) 선택시 (\d)등급 상향$/))) {
      if (g.mathSubject === "미적") adj.mathDelta -= Number(m[1]);
    } else if (note === "영어 2등급 1등급으로 간주") adj.englishTwoAsOne = true;
    else if ((m = note.match(/^수\(미적\/기하\) 선택시 (\d+)이내$/))) {
      if (isAdvancedMath) adj.limitOverride = Number(m[1]);
    } else if ((m = note.match(/^탐\(과\) 선택시 (\d+)이내$/))) {
      if (g.inquiryType === "과") adj.limitOverride = Number(m[1]);
    } else if ((m = note.match(/^수\(확통\) 선택시 합 (\d+)이내$/))) {
      if (g.mathSubject === "확통") adj.limitOverride = Number(m[1]);
    } else if (note.startsWith("약식 표기")) adj.caveats.push(note);
    else if (/필수\s?응시/.test(note)) adj.caveats.push(`응시 조건 확인: ${note}`);
    else adj.caveats.push(`직접 확인: ${note}`);
  }
  return adj;
}

function roundInquiry(v: number, mode: Adjust["inquiryRound"]): number {
  if (mode === "floor") return Math.floor(v);
  if (mode === "round") return Math.round(v);
  if (mode === "ceil") return Math.ceil(v);
  return v;
}

/** 영역 하나의 적용 등급. 과목·탐구 종류가 맞지 않으면 "ineligible", 등급이 비었으면 "missing". */
function areaGrade(spec: AreaSpec, g: MockGrades, adj: Adjust): number | "ineligible" | "missing" {
  if (spec.mathSubjects && !spec.mathSubjects.includes(g.mathSubject)) return "ineligible";
  if (spec.inquiryTypes && !spec.inquiryTypes.includes(g.inquiryType)) return "ineligible";
  const pick = (v: number | null) => (v == null ? "missing" : v);
  switch (spec.key) {
    case "ko":
      return pick(g.korean);
    case "ma":
      return g.math == null ? "missing" : Math.min(9, Math.max(1, g.math + adj.mathDelta));
    case "en":
      return g.english == null ? "missing" : adj.englishTwoAsOne && g.english === 2 ? 1 : g.english;
    case "hi":
      return pick(g.history);
    case "t1":
      return pick(g.inquiry1);
    case "t2":
      return pick(g.inquiry2);
    case "t": {
      if (g.inquiry1 == null || g.inquiry2 == null) {
        const one = g.inquiry1 ?? g.inquiry2;
        return spec.inquiryMode === "best" && one != null ? one : "missing";
      }
      return spec.inquiryMode === "best"
        ? Math.min(g.inquiry1, g.inquiry2)
        : roundInquiry((g.inquiry1 + g.inquiry2) / 2, adj.inquiryRound);
    }
  }
}

function formatNum(n: number): string {
  return Number.isInteger(n) ? String(n) : n.toFixed(1);
}

function evaluateAlternative(alt: ParsedAlternative, g: MockGrades) {
  const adj = applyNotes(alt.notes, g);
  const { rule } = alt;
  const limit = adj.limitOverride ?? rule.limit;
  let missing = false;

  const scored = rule.areas.map((spec) => ({
    key: spec.key,
    grade: areaGrade(spec, g, adj),
  }));
  if (scored.some((a) => a.grade === "missing")) missing = true;
  const usable = scored.filter((a): a is { key: AreaKey; grade: number } => typeof a.grade === "number");

  const count = rule.count ?? rule.areas.length;
  const candidates =
    rule.count == null ? (usable.length === scored.length ? [usable] : []) : combinations(usable, count);
  const valid = candidates.filter((combo) => {
    if (!rule.include) return true;
    const keys = combo.map((a) => a.key);
    return "anyOf" in rule.include
      ? rule.include.anyOf.some((k) => keys.includes(k))
      : rule.include.allOf.every((k) => keys.includes(k));
  });
  const value = (combo: { grade: number }[]) =>
    rule.agg === "each"
      ? Math.max(...combo.map((a) => a.grade))
      : rule.agg === "avg"
        ? combo.reduce((s, a) => s + a.grade, 0) / combo.length
        : combo.reduce((s, a) => s + a.grade, 0);
  const best = valid.length > 0 ? valid.reduce((a, b) => (value(b) < value(a) ? b : a)) : null;
  const mainPass = best != null && value(best) <= limit;

  const extraResults = rule.extras.map((e) => {
    const grade = areaGrade({ key: e.key }, g, adj);
    if (grade === "missing") missing = true;
    return { ...e, grade, pass: typeof grade === "number" && grade <= e.limit };
  });

  const aggLabel = rule.agg === "sum" ? "합" : rule.agg === "avg" ? "평균" : "각";
  const mainDetail = best
    ? `${best.map((a) => KEY_LABEL[a.key]).join("+")} ${aggLabel} ${formatNum(value(best))} (기준 ${limit} 이내)`
    : `조건에 맞는 영역 조합 없음 (기준 ${aggLabel} ${limit} 이내)`;
  const extraDetail = extraResults.map(
    (e) => `${KEY_LABEL[e.key]} ${typeof e.grade === "number" ? e.grade : "-"} (기준 ${e.limit} 이내)`,
  );
  return {
    pass: mainPass && extraResults.every((e) => e.pass),
    missing,
    detail: [mainDetail, ...extraDetail].join(" · "),
    caveats: adj.caveats,
  };
}

/**
 * 선생님·학생이 카드에 줄여 적은 "2합5", "1합 4", "2합 9(수학포함)", "3합 7 한국사 4 이내",
 * "2합6/과탐필수/한국사4" 같은 약식 표기. 국·수·영·탐(1과목, "탐구는 평균"이면 2과목 평균) 중
 * N개 합으로 본다.
 */
export function parseShorthandStandard(text: string): ParsedAlternative | null {
  const m = text.match(/(\d)\s*합\s*(\d+)/);
  if (!m) return null;
  const rest = text.replace(m[0], "");
  // 약식 표기에 쓰일 법한 말만 남아 있어야 한다. 모르는 말이 섞이면 추측하지 않는다.
  const leftover = rest
    .replace(/국\s*,?\s*영\s*,?\s*수\s*,?\s*탐\s*중/, "")
    .replace(/수학\s*(포함|필수)/g, "")
    .replace(/탐구\s*1과목(\s*반영)?|탐구는\s*평균/g, "")
    .replace(/확통\s*선택\s*시\s*\d\s*등급\s*하향\s*(적용)?/g, "")
    .replace(/한국사\s*\d\s*(이내)?/g, "")
    .replace(/과탐\s*(1과목\s*)?(필수|응시)/g, "")
    .replace(/이내|[()/,\s]/g, "");
  if (leftover !== "") return null;
  const history = rest.match(/한국사\s*(\d)/);
  const inquiryAvg = /탐구는\s*평균/.test(rest);
  const notes = [`약식 표기라 탐구 ${inquiryAvg ? "2과목 평균" : "1과목"} 기준으로 판정`];
  if (/과탐\s*(1과목\s*)?(필수|응시)/.test(rest)) notes.push("과탐 필수응시");
  const statsPenalty = rest.match(/확통\s*선택\s*시\s*(\d)\s*등급\s*하향/);
  if (statsPenalty) notes.push(`수(확통) 선택시 ${statsPenalty[1]}등급 하향`);
  return {
    rule: {
      areas: [{ key: "ko" }, { key: "ma" }, { key: "en" }, { key: "t", inquiryMode: inquiryAvg ? "avg" : "best" }],
      count: Number(m[1]),
      agg: "sum",
      limit: Number(m[2]),
      include: /수학\s*(포함|필수)/.test(rest) ? { allOf: ["ma"] } : null,
      extras: history ? [{ key: "hi", limit: Number(history[1]) }] : [],
    },
    notes,
  };
}

export function evaluateMinimumStandard(text: string | null | undefined, g: MockGrades): MinimumVerdict {
  const trimmed = (text ?? "").trim();
  if (!trimmed || /^(?:(?:최저\s*)?없음(?:[.,\s][\s\S]*)?|-|x)$/i.test(trimmed)) return { status: "none" };
  const shorthand = parseShorthandStandard(trimmed);
  const alts = parseMinimumStandard(trimmed) ?? (shorthand ? [shorthand] : null);
  if (!alts) return { status: "unknown", reason: "기준 문구를 해석하지 못했습니다" };
  const results = alts.map((a) => evaluateAlternative(a, g));
  const passed = results.find((r) => r.pass);
  if (passed) return { status: "pass", detail: passed.detail, caveats: passed.caveats };
  const first = results[0];
  if (results.some((r) => r.missing)) return { status: "missing", detail: first.detail, caveats: first.caveats };
  return { status: "fail", detail: first.detail, caveats: first.caveats };
}
