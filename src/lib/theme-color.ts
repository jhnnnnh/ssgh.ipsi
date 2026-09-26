/**
 * 학생이 고른 단일 색상(hex)으로 Tailwind의 indigo 50~950 11단계 램프를 생성한다.
 * Tailwind v4는 색 유틸리티를 `var(--color-indigo-600)` 형태로 컴파일하므로,
 * 이 변수들을 스코프에 맞게 override하면 클래스 이름을 하나도 바꾸지 않고
 * 앱 전체의 인디고 강조색을 학생이 고른 색으로 바꿀 수 있다.
 */

const HEX_RE = /^#([0-9a-fA-F]{6})$/;

function hexToHsl(hex: string) {
  const r = parseInt(hex.slice(1, 3), 16) / 255;
  const g = parseInt(hex.slice(3, 5), 16) / 255;
  const b = parseInt(hex.slice(5, 7), 16) / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  const d = max - min;
  let h = 0;
  let s = 0;
  if (d !== 0) {
    s = d / (1 - Math.abs(2 * l - 1));
    switch (max) {
      case r:
        h = ((g - b) / d) % 6;
        break;
      case g:
        h = (b - r) / d + 2;
        break;
      default:
        h = (r - g) / d + 4;
    }
    h *= 60;
    if (h < 0) h += 360;
  }
  return { h, s: s * 100, l: l * 100 };
}

function hslToHex(h: number, s: number, l: number) {
  const sNorm = s / 100;
  const lNorm = l / 100;
  const c = (1 - Math.abs(2 * lNorm - 1)) * sNorm;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = lNorm - c / 2;
  let r = 0;
  let g = 0;
  let b = 0;
  if (h < 60) [r, g, b] = [c, x, 0];
  else if (h < 120) [r, g, b] = [x, c, 0];
  else if (h < 180) [r, g, b] = [0, c, x];
  else if (h < 240) [r, g, b] = [0, x, c];
  else if (h < 300) [r, g, b] = [x, 0, c];
  else [r, g, b] = [c, 0, x];
  const toHex = (v: number) =>
    Math.round((v + m) * 255)
      .toString(16)
      .padStart(2, "0");
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}

/** shade별 목표 lightness(%). 채도/색상은 사용자가 고른 색을 그대로 쓴다. */
const RAMP_LIGHTNESS: [shade: string, lightness: number][] = [
  ["50", 96],
  ["100", 91],
  ["200", 83],
  ["300", 72],
  ["400", 60],
  ["500", 50],
  ["600", 43],
  ["700", 36],
  ["800", 29],
  ["900", 24],
  ["950", 15],
];

export function isValidHexColor(value: string): boolean {
  return HEX_RE.test(value);
}

/** 학생이 고른 hex 색으로 --color-indigo-* CSS 변수 override 세트를 만든다. */
export function buildThemeColorVars(hex: string): Record<string, string> {
  const { h, s } = hexToHsl(hex);
  const saturation = Math.max(s, 35);
  const vars: Record<string, string> = {};
  for (const [shade, lightness] of RAMP_LIGHTNESS) {
    vars[`--color-indigo-${shade}`] = hslToHex(h, saturation, lightness);
  }
  vars["--color-brand"] = vars["--color-indigo-600"];
  vars["--color-brand-hover"] = vars["--color-indigo-700"];
  vars["--color-brand-active"] = vars["--color-indigo-800"];
  vars["--color-brand-soft"] = vars["--color-indigo-50"];
  vars["--color-focus"] = vars["--color-indigo-600"];
  return vars;
}
