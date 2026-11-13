import { describe, expect, it } from "vitest";
import { DEFAULT_CONFIG, HARD_LIMITS } from "@uishapeshifter/contracts";
import type { AuditThresholds, JsonPatchOp, UIConfig } from "@uishapeshifter/contracts";
import { applyPatchWithLimits, checkLimits } from "./limit-gate";
import type { ContrastFn } from "./limit-gate";

// Pragurile scrise de mână, cum le dă thresholdsFor(needs) din a11y/thresholds.ts (C): normal și contrast ridicat.
const NORMAL: AuditThresholds = {
  minFontPx: HARD_LIMITS.minFontPx,
  minContrastText: HARD_LIMITS.minContrastText,
  minContrastLargeText: HARD_LIMITS.minContrastLargeText,
  minTargetPx: HARD_LIMITS.minTargetPx,
  minLineHeight: HARD_LIMITS.minLineHeight,
};
const HIGH_CONTRAST: AuditThresholds = { ...NORMAL, minContrastText: 7, minContrastLargeText: 4.5 };

// Rapoartele reale (WCAG) pentru culorile din DEFAULT_CONFIG și din teste, calculate o dată.
const KNOWN_RATIOS: Record<string, number> = {
  "#111827|#FFFFFF": 17.74,
  "#FFFFFF|#C2410C": 5.18,
  "#777777|#FFFFFF": 4.478,
  "#FFFFFF|#777777": 4.478, // raportul nu depinde de ordine
  "#949494|#FFFFFF": 3.03,
};

/** Funcția de contrast falsă: un tabel; o pereche necunoscută aruncă, ca funcția lui C la o culoare necunoscută. */
function fakeContrast(table: Record<string, number> = KNOWN_RATIOS): ContrastFn & { calls: number } {
  const fn = Object.assign(
    (fg: string, bg: string) => {
      fn.calls++;
      const ratio = table[`${fg}|${bg}`];
      if (ratio === undefined) throw new Error(`culoare necunoscută: ${fg} pe ${bg}`);
      return ratio;
    },
    { calls: 0 },
  );
  return fn;
}

function gate(ops: JsonPatchOp[], thresholds: AuditThresholds = NORMAL, contrast: ContrastFn = fakeContrast()) {
  return applyPatchWithLimits(DEFAULT_CONFIG, ops, thresholds, contrast);
}

function violationsOf(ops: JsonPatchOp[], thresholds: AuditThresholds = NORMAL, contrast?: ContrastFn) {
  const result = gate(ops, thresholds, contrast);
  return result.ok ? [] : result.violations;
}

function replace(path: string, value: unknown): JsonPatchOp {
  return { op: "replace", path, value };
}

describe("criteriul de gata B1", () => {
  it("baseFontPx 14 pe DEFAULT_CONFIG întoarce o încălcare min-font", () => {
    const result = gate([replace("/theme/baseFontPx", 14)]);
    expect(result).toEqual({
      ok: false,
      violations: [
        {
          rule: "min-font",
          path: "/theme/baseFontPx",
          received: 14,
          limit: 16,
          message: "Fontul de bază ar fi 14px; minimul pentru acest utilizator e 16px.",
        },
      ],
    });
  });

  it("baseFontPx 20 trece, iar config-ul original rămâne neatins", () => {
    const before = structuredClone(DEFAULT_CONFIG);
    const result = gate([replace("/theme/baseFontPx", 20)]);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.config.theme.baseFontPx).toBe(20);
    expect(DEFAULT_CONFIG).toEqual(before);
  });
});

describe("checkLimits", () => {
  it("DEFAULT_CONFIG trece cu pragurile normale", () => {
    expect(checkLimits(DEFAULT_CONFIG, NORMAL, fakeContrast())).toEqual([]);
  });

  it("fontul minim din profil urcă pragul", () => {
    const v = violationsOf([replace("/theme/baseFontPx", 18)], { ...NORMAL, minFontPx: 20 });
    expect(v).toMatchObject([{ rule: "min-font", received: 18, limit: 20 }]);
  });

  it("fontul peste HARD_LIMITS.maxFontPx întoarce max-font", () => {
    const v = violationsOf([replace("/theme/baseFontPx", HARD_LIMITS.maxFontPx + 1)]);
    expect(v).toMatchObject([{ rule: "max-font", received: 41, limit: HARD_LIMITS.maxFontPx }]);
  });

  it("spune explicit când fontul minim din profil e peste maximul permis", () => {
    const v = checkLimits(DEFAULT_CONFIG, { ...NORMAL, minFontPx: 42 }, fakeContrast());
    expect(v).toHaveLength(1);
    expect(v[0]).toMatchObject({ rule: "min-font", limit: 42 });
    expect(v[0].message).toContain("peste maximul permis (40px)");
  });

  it("lineHeight sub minim întoarce line-height", () => {
    expect(violationsOf([replace("/theme/lineHeight", 1.4)])).toMatchObject([
      { rule: "line-height", path: "/theme/lineHeight", received: 1.4, limit: 1.5 },
    ]);
  });

  it("minTargetPx sub minimul global sau din profil întoarce target-size", () => {
    expect(violationsOf([replace("/minTargetPx", 40)])).toMatchObject([{ rule: "target-size", limit: 44 }]);
    expect(violationsOf([replace("/minTargetPx", 48)], { ...NORMAL, minTargetPx: 56 })).toMatchObject([
      { rule: "target-size", received: 48, limit: 56 },
    ]);
  });

  it("textul #777777 pe alb (4.48:1) pică la pragul 4.5", () => {
    expect(violationsOf([replace("/theme/palette/text", "#777777")])).toMatchObject([
      { rule: "contrast", path: "/theme/palette/text", received: 4.47, limit: 4.5 },
    ]);
  });

  it("textul mare (baseFontPx >= largeTextPx) folosește pragul pentru text mare", () => {
    const text = replace("/theme/palette/text", "#949494"); // 3.03:1
    expect(violationsOf([text, replace("/theme/baseFontPx", HARD_LIMITS.largeTextPx)])).toEqual([]);
    expect(violationsOf([text, replace("/theme/baseFontPx", HARD_LIMITS.largeTextPx - 1)])).toMatchObject([
      { rule: "contrast", limit: 4.5 },
    ]);
  });

  it("onPrimary pe primary sub prag întoarce contrast", () => {
    const v = violationsOf([
      replace("/theme/palette/primary", "#777777"),
      replace("/theme/palette/onPrimary", "#FFFFFF"),
    ]);
    expect(v).toMatchObject([{ rule: "contrast", path: "/theme/palette/onPrimary", received: 4.47, limit: 4.5 }]);
  });

  it("DEFAULT_CONFIG pică la contrast ridicat (prag 7) din cauza primary; repararea e treaba store-ului", () => {
    expect(checkLimits(DEFAULT_CONFIG, HIGH_CONTRAST, fakeContrast())).toMatchObject([
      { rule: "contrast", path: "/theme/palette/onPrimary", received: 5.18, limit: 7 },
    ]);
  });

  it("un modul pinned nu poate fi ascuns", () => {
    const v = violationsOf([
      { op: "add", path: "/modules/@messages/pinned", value: true },
      replace("/modules/@messages/visible", false),
    ]);
    expect(v).toMatchObject([{ rule: "pinned-hidden", path: "/modules/@messages/visible" }]);
  });

  it("întoarce toate încălcările deodată", () => {
    const v = violationsOf([
      replace("/theme/baseFontPx", 14),
      replace("/theme/lineHeight", 1.2),
      replace("/minTargetPx", 30),
      replace("/theme/palette/text", "#777777"),
    ]);
    expect(v.map((x) => x.rule)).toEqual(["min-font", "line-height", "target-size", "contrast"]);
  });

  it("nu aruncă dacă funcția de contrast aruncă sau întoarce NaN", () => {
    const throws = checkLimits(DEFAULT_CONFIG, NORMAL, fakeContrast({}));
    expect(throws.map((v) => [v.rule, v.path])).toEqual([
      ["contrast", "/theme/palette/text"],
      ["contrast", "/theme/palette/onPrimary"],
    ]);
    const nan = checkLimits(DEFAULT_CONFIG, NORMAL, () => Number.NaN);
    expect(nan).toHaveLength(2);
  });
});

describe("applyPatchWithLimits: ordinea verificărilor", () => {
  it("o culoare care nu e hex se oprește la formă, înainte de contrast", () => {
    const contrast = fakeContrast();
    const v = violationsOf([replace("/theme/palette/text", "portocaliu")], NORMAL, contrast);
    expect(v).toMatchObject([{ rule: "invalid-type", path: "/theme/palette/text" }]);
    expect(contrast.calls).toBe(0);
  });

  it("o cale greșită se oprește la patch", () => {
    expect(violationsOf([replace("/theme/nope", 1)])).toMatchObject([{ rule: "invalid-path" }]);
  });

  it("scoaterea unui câmp obligatoriu e refuzată de formă", () => {
    const result = gate([{ op: "remove", path: "/theme/fontFamily" }]);
    expect(result).toMatchObject({ ok: false, violations: [{ rule: "invalid-type", path: "/theme/fontFamily" }] });
  });

  it("rezultatul e un UIConfig nou, nu o referință la cel vechi", () => {
    const result = gate([replace("/nav/showLabels", false)]);
    expect(result.ok).toBe(true);
    if (result.ok) {
      const next: UIConfig = result.config;
      expect(next).not.toBe(DEFAULT_CONFIG);
      expect(next.theme).not.toBe(DEFAULT_CONFIG.theme);
    }
  });
});
