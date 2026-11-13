// Poarta de limite din store (specs/02, punctul 3; pragurile din specs/07). Primește config-ul REZULTAT și pragurile
// utilizatorului și întoarce TOATE încălcările deodată, ca agentul să le poată repara într-un singur pas.
// Pragurile vin din `thresholdsFor(needs)` (a11y/thresholds.ts, al lui C); contrastul, din funcția lui C,
// primită ca parametru ca poarta să nu depindă de implementarea ei și să poată fi testată cu valori cunoscute.

import { HARD_LIMITS } from "@uishapeshifter/contracts";
import type { AuditThresholds, JsonPatchOp, Palette, UIConfig } from "@uishapeshifter/contracts";
import { validateConfigShape } from "./config-shape";
import type { ConfigViolation, GateResult } from "./config-violation";
import { applyJsonPatch } from "./json-patch";

/** Raportul de contrast WCAG (1–21) între două culori. Implementarea: `contrastRatio` din a11y/contrast.ts. */
export type ContrastFn = (foreground: string, background: string) => number;

/** Perechile din specs/02: textul pe fundal și textul de pe butoanele principale. */
const CONTRAST_PAIRS: ReadonlyArray<{ foreground: keyof Palette; background: keyof Palette }> = [
  { foreground: "text", background: "background" },
  { foreground: "onPrimary", background: "primary" },
];
/** Raportul îl arătăm cu 2 zecimale, rotunjit în jos (4.478 → 4.47), ca să nu pară că trece. */
const RATIO_DISPLAY_FACTOR = 100;

/** Patch → formă → limite. Config-ul primit nu se schimbă; la succes întoarce unul nou (fără revision crescut). */
export function applyPatchWithLimits(
  config: UIConfig,
  ops: readonly JsonPatchOp[],
  thresholds: AuditThresholds,
  contrastRatio: ContrastFn,
): GateResult<UIConfig> {
  const patched = applyJsonPatch(config, ops);
  if (!patched.ok) return patched;
  const shapeViolations = validateConfigShape(patched.config);
  // Forma întâi: limitele (și funcția de contrast) primesc doar un config cu tipuri corecte și culori hex.
  if (shapeViolations.length > 0) return { ok: false, violations: shapeViolations };
  const candidate = patched.config as UIConfig; // forma tocmai a fost verificată
  const violations = checkLimits(candidate, thresholds, contrastRatio);
  return violations.length > 0 ? { ok: false, violations } : { ok: true, config: candidate };
}

export function checkLimits(config: UIConfig, thresholds: AuditThresholds, contrastRatio: ContrastFn): ConfigViolation[] {
  return [
    ...checkFontSize(config, thresholds),
    ...checkLineHeight(config, thresholds),
    ...checkTargetSize(config, thresholds),
    ...checkContrast(config, thresholds, contrastRatio),
    ...checkPinnedModules(config),
  ];
}

function checkFontSize(config: UIConfig, thresholds: AuditThresholds): ConfigViolation[] {
  const path = "/theme/baseFontPx";
  const font = config.theme.baseFontPx;
  if (thresholds.minFontPx > HARD_LIMITS.maxFontPx) {
    return [
      {
        rule: "min-font",
        path,
        received: font,
        limit: thresholds.minFontPx,
        message:
          `Fontul minim cerut de profil (${thresholds.minFontPx}px) e peste maximul permis (${HARD_LIMITS.maxFontPx}px): ` +
          "nicio valoare nu poate trece. Profilul trebuie corectat, nu tema.",
      },
    ];
  }
  if (font < thresholds.minFontPx) {
    return [
      {
        rule: "min-font",
        path,
        received: font,
        limit: thresholds.minFontPx,
        message: `Fontul de bază ar fi ${font}px; minimul pentru acest utilizator e ${thresholds.minFontPx}px.`,
      },
    ];
  }
  if (font > HARD_LIMITS.maxFontPx) {
    return [
      {
        rule: "max-font",
        path,
        received: font,
        limit: HARD_LIMITS.maxFontPx,
        message: `Fontul de bază ar fi ${font}px; maximul e ${HARD_LIMITS.maxFontPx}px.`,
      },
    ];
  }
  return [];
}

function checkLineHeight(config: UIConfig, thresholds: AuditThresholds): ConfigViolation[] {
  const lineHeight = config.theme.lineHeight;
  if (lineHeight >= thresholds.minLineHeight) return [];
  return [
    {
      rule: "line-height",
      path: "/theme/lineHeight",
      received: lineHeight,
      limit: thresholds.minLineHeight,
      message: `Înălțimea rândului ar fi ${lineHeight}; minimul e ${thresholds.minLineHeight}.`,
    },
  ];
}

function checkTargetSize(config: UIConfig, thresholds: AuditThresholds): ConfigViolation[] {
  if (config.minTargetPx >= thresholds.minTargetPx) return [];
  return [
    {
      rule: "target-size",
      path: "/minTargetPx",
      received: config.minTargetPx,
      limit: thresholds.minTargetPx,
      message: `Țintele de apăsat ar avea ${config.minTargetPx}px; minimul pentru acest utilizator e ${thresholds.minTargetPx}px.`,
    },
  ];
}

/** Textul de bază e „mare” de la HARD_LIMITS.largeTextPx; atunci se aplică pragul mai mic, pentru text mare. */
function checkContrast(config: UIConfig, thresholds: AuditThresholds, contrastRatio: ContrastFn): ConfigViolation[] {
  const isLarge = config.theme.baseFontPx >= HARD_LIMITS.largeTextPx;
  const required = isLarge ? thresholds.minContrastLargeText : thresholds.minContrastText;
  const palette = config.theme.palette;
  const violations: ConfigViolation[] = [];
  for (const { foreground, background } of CONTRAST_PAIRS) {
    const path = `/theme/palette/${foreground}`;
    const colors = `${palette[foreground]} pe ${palette[background]}`;
    const ratio = safeRatio(contrastRatio, palette[foreground], palette[background]);
    if (ratio === null) {
      violations.push({
        rule: "contrast",
        path,
        received: palette[foreground],
        limit: required,
        message: `Nu pot calcula contrastul pentru ${colors}; folosește culori #rrggbb.`,
      });
    } else if (ratio < required) {
      const shown = Math.floor(ratio * RATIO_DISPLAY_FACTOR) / RATIO_DISPLAY_FACTOR;
      violations.push({
        rule: "contrast",
        path,
        received: shown,
        limit: required,
        message: `Contrastul ${colors} ar fi ${shown}:1; trebuie cel puțin ${required}:1.`,
      });
    }
  }
  return violations;
}

/** Funcția de contrast poate arunca la o culoare pe care n-o înțelege; poarta nu aruncă niciodată. */
function safeRatio(contrastRatio: ContrastFn, foreground: string, background: string): number | null {
  try {
    const ratio = contrastRatio(foreground, background);
    return Number.isFinite(ratio) ? ratio : null;
  } catch {
    return null;
  }
}

/** Un modul fixat (`pinned`) nu poate fi ascuns. Verificăm rezultatul, nu tranziția. */
function checkPinnedModules(config: UIConfig): ConfigViolation[] {
  return config.modules
    .filter((m) => m.pinned === true && !m.visible)
    .map((m) => ({
      rule: "pinned-hidden" as const,
      path: `/modules/@${m.id}/visible`,
      received: false,
      limit: "true",
      message: `Modulul „${m.title}” e fixat de utilizator și nu poate fi ascuns.`,
    }));
}
