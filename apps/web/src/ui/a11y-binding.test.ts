import { describe, expect, it } from "vitest";
import { DEFAULT_CONFIG, DEFAULT_PROFILE_NEEDS } from "@uishapeshifter/contracts";
import type { UserNeeds } from "@uishapeshifter/contracts";
import { configForNeeds, createAppConfigStore, realContrastRatio, thresholdsFor } from "./a11y-binding";
import type { ChangeMeta } from "./config-store";
import { checkLimits } from "./limit-gate";

const AGENT: ChangeMeta = { by: "agent", reason: "test" };

describe("store-ul legat de funcțiile reale din a11y/", () => {
  it("contrastul real: #777777 pe alb e 4.478, sub 4.5", () => {
    expect(realContrastRatio("#777777", "#FFFFFF")).toBeCloseTo(4.478, 3);
  });

  it("criteriul B1 cu pragurile și contrastul reale: 14 refuzat, 20 aplicat", () => {
    const store = createAppConfigStore(DEFAULT_PROFILE_NEEDS);
    const refused = store.getState().applyPatch([{ op: "replace", path: "/theme/baseFontPx", value: 14 }], AGENT);
    expect(refused).toMatchObject({ ok: false, violations: [{ rule: "min-font", limit: 16 }] });
    const applied = store.getState().applyPatch([{ op: "replace", path: "/theme/baseFontPx", value: 20 }], AGENT);
    expect(applied).toEqual({ ok: true, revision: 1, applied: 1 });
  });

  it("textul #777777 e refuzat cu raportul real afișat rotunjit în jos", () => {
    const store = createAppConfigStore(DEFAULT_PROFILE_NEEDS);
    const result = store
      .getState()
      .applyPatch([{ op: "replace", path: "/theme/palette/text", value: "#777777" }], AGENT);
    expect(result).toMatchObject({ ok: false, violations: [{ rule: "contrast", received: 4.47, limit: 4.5 }] });
  });
});

describe("Maria (specs/08) cu funcțiile reale", () => {
  const MARIA: UserNeeds = {
    minFontPx: 20,
    contrast: "high",
    minTargetPx: 56,
    reducedMotion: false,
    prefersVoice: true,
  };

  it("DEFAULT_CONFIG pică la pragul 7 înainte de ajustare (primary)", () => {
    const violations = checkLimits(DEFAULT_CONFIG, thresholdsFor(MARIA), realContrastRatio);
    expect(violations.map((v) => v.rule)).toContain("contrast");
  });

  it("DEFAULT_CONFIG ajustat trece checkLimits cu contrastRatio adevărat la pragul 7", () => {
    const adjusted = configForNeeds(DEFAULT_CONFIG, MARIA);
    expect(thresholdsFor(MARIA).minContrastText).toBe(7);
    expect(checkLimits(adjusted, thresholdsFor(MARIA), realContrastRatio)).toEqual([]);
    expect(adjusted.theme.palette.primary).not.toBe(DEFAULT_CONFIG.theme.palette.primary);
    expect(realContrastRatio(adjusted.theme.palette.onPrimary, adjusted.theme.palette.primary)).toBeGreaterThanOrEqual(
      7,
    );
    expect(adjusted).toMatchObject({ minTargetPx: 56, theme: { baseFontPx: 20 } });
  });

  it("store-ul pornit cu config-ul ajustat acceptă un patch obișnuit", () => {
    const store = createAppConfigStore(MARIA, configForNeeds(DEFAULT_CONFIG, MARIA));
    const result = store.getState().applyPatch([{ op: "replace", path: "/nav/showLabels", value: false }], AGENT);
    expect(result).toEqual({ ok: true, revision: 1, applied: 1 });
  });
});
