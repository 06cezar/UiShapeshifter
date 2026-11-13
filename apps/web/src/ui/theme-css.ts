// Tema → variabile CSS pe :root (specs/02, punctul 6; lista numelor e tot acolo).
// Componentele folosesc doar aceste variabile, așa că o schimbare de temă nu le re-montează.

import type { Palette, Theme } from "@uishapeshifter/contracts";

export type CssVars = Record<`--${string}`, string>;

/** Treptele de font: --font-step-n = baseFontPx * scale^n (0 = textul de bază, 4 = cel mai mare titlu). */
export const FONT_STEPS = [0, 1, 2, 3, 4] as const;
/** Mărimile în px le rotunjim la 2 zecimale (16 * 1.25^4 = 39.0625 → 39.06px). */
const PX_DECIMALS = 2;

const PALETTE_VARS = {
  background: "--color-background",
  surface: "--color-surface",
  text: "--color-text",
  textMuted: "--color-text-muted",
  primary: "--color-primary",
  onPrimary: "--color-on-primary",
  danger: "--color-danger",
  focus: "--color-focus",
} satisfies Record<keyof Palette, `--${string}`>;

/** `minTargetPx` stă în UIConfig, nu în temă, dar componentele au nevoie de el la fel ca de restul temei. */
export function themeToCssVars(theme: Theme, minTargetPx: number): CssVars {
  const vars: CssVars = {
    "--font-base": px(theme.baseFontPx),
    "--line-height": String(theme.lineHeight),
    "--font-family": theme.fontFamily,
    "--radius": px(theme.radiusPx),
    "--spacing": px(theme.spacingPx),
    "--min-target": px(minTargetPx),
  };
  for (const [key, name] of Object.entries(PALETTE_VARS) as [keyof Palette, `--${string}`][]) {
    vars[name] = theme.palette[key];
  }
  for (const step of FONT_STEPS) {
    vars[`--font-step-${step}`] = px(theme.baseFontPx * Math.pow(theme.scale, step));
  }
  return vars;
}

function px(value: number): string {
  return `${Number(value.toFixed(PX_DECIMALS))}px`;
}
