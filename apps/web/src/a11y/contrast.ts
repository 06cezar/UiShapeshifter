// Funcțiile de contrast WCAG 2.x: citirea culorilor, luminanța relativă, raportul și ajustarea unei culori
// până la prag. Folosite de audit (specs/07) și de poarta de limite din store (specs/02).
// Funcții pure, fără DOM.

import { HARD_LIMITS } from "@uishapeshifter/contracts";

export interface Rgba {
  r: number; // 0–255
  g: number;
  b: number;
  a: number; // 0–1
}

/** Textul bold e „mare” de la 14pt (18.66px) în sus; cel normal de la HARD_LIMITS.largeTextPx (24px). */
export const LARGE_BOLD_TEXT_PX = 18.66;
export const BOLD_WEIGHT = 700;

/** Pașii căutării binare a luminozității: 30 de înjumătățiri ajung sub o miime de procent. */
const LIGHTNESS_SEARCH_STEPS = 30;
/** Cât împingem luminozitatea (0–1) când rotunjirea la hex coboară raportul sub prag. */
const HEX_ROUNDING_NUDGE = 0.002;

const NAMED: Record<string, Rgba> = {
  white: { r: 255, g: 255, b: 255, a: 1 },
  black: { r: 0, g: 0, b: 0, a: 1 },
  transparent: { r: 0, g: 0, b: 0, a: 0 },
};

/**
 * Citește o culoare CSS: `#rgb`, `#rgba`, `#rrggbb`, `#rrggbbaa`, `rgb()`/`rgba()` (cu virgule sau spații,
 * inclusiv `/ alfa`), plus `white`, `black`, `transparent`. Întoarce `null` dacă nu o înțelege.
 */
export function parseColor(input: string): Rgba | null {
  const s = input.trim().toLowerCase();
  if (s in NAMED) return { ...NAMED[s] };

  const hex = /^#([0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})$/.exec(s);
  if (hex) {
    let h = hex[1];
    if (h.length <= 4) h = [...h].map((c) => c + c).join("");
    const n = (i: number) => parseInt(h.slice(i, i + 2), 16);
    return { r: n(0), g: n(2), b: n(4), a: h.length === 8 ? n(6) / 255 : 1 };
  }

  const fn = /^rgba?\(\s*([^)]*)\)$/.exec(s);
  if (fn) {
    const parts = fn[1].split(/\s*[,/]\s*|\s+/).filter(Boolean);
    if (parts.length < 3 || parts.length > 4) return null;
    const channel = (p: string) => (p.endsWith("%") ? (parseFloat(p) * 255) / 100 : parseFloat(p));
    const alpha = (p: string) => (p.endsWith("%") ? parseFloat(p) / 100 : parseFloat(p));
    const [r, g, b] = parts.slice(0, 3).map(channel);
    const a = parts.length === 4 ? alpha(parts[3]) : 1;
    if ([r, g, b, a].some((v) => !Number.isFinite(v))) return null;
    return { r: clamp(r, 0, 255), g: clamp(g, 0, 255), b: clamp(b, 0, 255), a: clamp(a, 0, 1) };
  }
  return null;
}

/** `#RRGGBB` (alfa ignorat; compune întâi cu `composite` dacă e cazul). */
export function toHex(c: Rgba): string {
  const h = (v: number) =>
    Math.round(clamp(v, 0, 255))
      .toString(16)
      .padStart(2, "0");
  return ("#" + h(c.r) + h(c.g) + h(c.b)).toUpperCase();
}

/** O culoare semitransparentă peste un fundal opac (cum o vede ochiul). */
export function composite(fg: Rgba, bg: Rgba): Rgba {
  const a = fg.a;
  return {
    r: fg.r * a + bg.r * (1 - a),
    g: fg.g * a + bg.g * (1 - a),
    b: fg.b * a + bg.b * (1 - a),
    a: 1,
  };
}

/** Luminanța relativă WCAG 2.x, 0 (negru) – 1 (alb). Constantele sunt cele din definiția WCAG (sRGB). */
export function relativeLuminance(color: Rgba | string): number {
  const c = typeof color === "string" ? mustParse(color) : color;
  const lin = (v: number) => {
    const s = v / 255;
    return s <= 0.04045 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  };
  return 0.2126 * lin(c.r) + 0.7152 * lin(c.g) + 0.0722 * lin(c.b);
}

/**
 * Raportul de contrast WCAG (1–21), nerotunjit: `#777777` pe alb dă 4.478…, deci NU trece de 4.5.
 * Dacă textul e semitransparent, se compune întâi peste fundal. Fundalul se consideră opac.
 */
export function contrastRatio(foreground: Rgba | string, background: Rgba | string): number {
  const bg = opaque(typeof background === "string" ? mustParse(background) : background);
  let fg = typeof foreground === "string" ? mustParse(foreground) : foreground;
  if (fg.a < 1) fg = composite(fg, bg);
  const l1 = relativeLuminance(fg);
  const l2 = relativeLuminance(bg);
  const [hi, lo] = l1 >= l2 ? [l1, l2] : [l2, l1];
  return (hi + 0.05) / (lo + 0.05);
}

/** Rotunjire pentru afișare (în jos, ca să nu arătăm „4.50” pentru 4.497). */
export function formatRatio(ratio: number): number {
  return Math.floor(ratio * 100) / 100;
}

export function isLargeText(fontPx: number, fontWeight = 400): boolean {
  return fontPx >= HARD_LIMITS.largeTextPx || (fontPx >= LARGE_BOLD_TEXT_PX && fontWeight >= BOLD_WEIGHT);
}

export interface ContrastThresholds {
  minContrastText: number;
  minContrastLargeText: number;
}

/** Pragul pentru un text anume: 4.5 / 3 normal, 7 / 4.5 cu contrast ridicat (vezi `thresholdsFor`). */
export function requiredTextContrast(
  fontPx: number | undefined,
  fontWeight: number | undefined,
  t: ContrastThresholds = HARD_LIMITS,
): number {
  return fontPx !== undefined && isLargeText(fontPx, fontWeight) ? t.minContrastLargeText : t.minContrastText;
}

export function meetsContrast(foreground: Rgba | string, background: Rgba | string, required: number): boolean {
  return contrastRatio(foreground, background) >= required;
}

/**
 * Cea mai apropiată variantă a culorii (aceeași nuanță și saturație, altă luminozitate) care atinge `target`
 * pe `background`. Întâi în direcția firească (mai închisă pe fundal deschis, mai deschisă pe fundal închis),
 * apoi în cealaltă. Dacă nicio variantă nu ajunge, întoarce negru sau alb, cel mai bun dintre ele.
 * Rezultatul e `#RRGGBB` și e verificat după rotunjirea la hex.
 */
export function adjustToContrast(color: Rgba | string, background: Rgba | string, target: number): string {
  const bg = opaque(typeof background === "string" ? mustParse(background) : background);
  let fg = typeof color === "string" ? mustParse(color) : color;
  if (fg.a < 1) fg = composite(fg, bg);
  if (contrastRatio(fg, bg) >= target) return toHex(fg);

  const hsl = rgbToHsl(fg);
  const darkerFirst = relativeLuminance(fg) <= relativeLuminance(bg);
  const order: (0 | 1)[] = darkerFirst ? [0, 1] : [1, 0];
  for (const towards of order) {
    const found = searchLightness(hsl, bg, target, towards);
    if (found) return found;
  }
  return contrastRatio(BLACK, bg) >= contrastRatio(WHITE, bg) ? "#000000" : "#FFFFFF";
}

// ---------- intern ----------

const BLACK: Rgba = { r: 0, g: 0, b: 0, a: 1 };
const WHITE: Rgba = { r: 255, g: 255, b: 255, a: 1 };

interface Hsl {
  h: number; // 0–360
  s: number; // 0–1
  l: number; // 0–1
}

/** Caută binar luminozitatea cea mai apropiată de cea inițială, mergând spre `towards` (0 = negru, 1 = alb). */
function searchLightness(start: Hsl, bg: Rgba, target: number, towards: 0 | 1): string | null {
  const at = (l: number) => hslToRgb({ ...start, l });
  if (contrastRatio(at(towards), bg) < target) return null;
  let near = start.l; // nu atinge pragul
  let far: number = towards; // îl atinge
  for (let i = 0; i < LIGHTNESS_SEARCH_STEPS; i++) {
    const mid = (near + far) / 2;
    if (contrastRatio(at(mid), bg) >= target) far = mid;
    else near = mid;
  }
  // rotunjirea la hex poate coborî raportul sub prag: mai împingem puțin spre capăt
  const step = towards === 0 ? -HEX_ROUNDING_NUDGE : HEX_ROUNDING_NUDGE;
  for (let l = far; towards === 0 ? l >= 0 : l <= 1; l += step) {
    const hex = toHex(at(l));
    if (contrastRatio(hex, bg) >= target) return hex;
  }
  const end = toHex(at(towards));
  return contrastRatio(end, bg) >= target ? end : null;
}

function rgbToHsl({ r, g, b }: Rgba): Hsl {
  const [rr, gg, bb] = [r / 255, g / 255, b / 255];
  const max = Math.max(rr, gg, bb);
  const min = Math.min(rr, gg, bb);
  const l = (max + min) / 2;
  const d = max - min;
  if (d === 0) return { h: 0, s: 0, l };
  const s = d / (1 - Math.abs(2 * l - 1));
  let h: number;
  if (max === rr) h = ((gg - bb) / d) % 6;
  else if (max === gg) h = (bb - rr) / d + 2;
  else h = (rr - gg) / d + 4;
  return { h: (h * 60 + 360) % 360, s, l };
}

function hslToRgb({ h, s, l }: Hsl): Rgba {
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = l - c / 2;
  const [r, g, b] =
    h < 60
      ? [c, x, 0]
      : h < 120
        ? [x, c, 0]
        : h < 180
          ? [0, c, x]
          : h < 240
            ? [0, x, c]
            : h < 300
              ? [x, 0, c]
              : [c, 0, x];
  return { r: (r + m) * 255, g: (g + m) * 255, b: (b + m) * 255, a: 1 };
}

function opaque(c: Rgba): Rgba {
  return c.a < 1 ? composite(c, WHITE) : c;
}

function mustParse(s: string): Rgba {
  const c = parseColor(s);
  if (!c) throw new Error(`Culoare necunoscută: ${s}`);
  return c;
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, v));
}
