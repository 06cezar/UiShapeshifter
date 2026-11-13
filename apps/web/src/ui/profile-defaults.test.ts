import { describe, expect, it } from "vitest";
import { DEFAULT_CONFIG, HARD_LIMITS } from "@uishapeshifter/contracts";
import { checkLimits } from "./limit-gate";
import { adjustConfigToProfile } from "./profile-defaults";
import type { AdjustColorFn } from "./profile-defaults";
import { fakeContrast, HIGH_CONTRAST_THRESHOLDS, KNOWN_RATIOS, NORMAL_THRESHOLDS } from "./test-fixtures";

/** Pragurile Mariei (specs/08): 20px, contrast ridicat, ținte de 56px. */
const MARIA_THRESHOLDS = { ...HIGH_CONTRAST_THRESHOLDS, minFontPx: 20, minTargetPx: 56 };
const DARKER_PRIMARY = "#7C2D12";

/** Ajustarea falsă: întoarce o culoare fixă și ține minte cu ce a fost chemată. */
function fakeAdjust(result: string): AdjustColorFn & { calls: [string, string, number][] } {
  const calls: [string, string, number][] = [];
  return Object.assign(
    (color: string, background: string, target: number) => {
      calls.push([color, background, target]);
      return result;
    },
    { calls },
  );
}

describe("adjustConfigToProfile", () => {
  it("cu pragurile normale, DEFAULT_CONFIG rămâne neschimbat", () => {
    const adjust = fakeAdjust("#000000");
    const next = adjustConfigToProfile(DEFAULT_CONFIG, NORMAL_THRESHOLDS, { ratio: fakeContrast(), adjust });
    expect(next).toEqual(DEFAULT_CONFIG);
    expect(next).not.toBe(DEFAULT_CONFIG);
    expect(adjust.calls).toEqual([]);
  });

  it("pentru Maria: fontul și ținta urcă, primary se închide la pragul 7", () => {
    const adjust = fakeAdjust(DARKER_PRIMARY);
    const next = adjustConfigToProfile(DEFAULT_CONFIG, MARIA_THRESHOLDS, { ratio: fakeContrast(), adjust });
    expect(next.theme.baseFontPx).toBe(20);
    expect(next.minTargetPx).toBe(56);
    expect(adjust.calls).toEqual([["#C2410C", "#FFFFFF", 7]]);
    expect(next.theme.palette).toMatchObject({ primary: DARKER_PRIMARY, onPrimary: "#FFFFFF", text: "#111827" });
  });

  it("rezultatul pentru Maria trece poarta (cu contrastul fals care știe noua culoare)", () => {
    const ratio = fakeContrast({ ...KNOWN_RATIOS, [`#FFFFFF|${DARKER_PRIMARY}`]: 9.0 });
    const next = adjustConfigToProfile(DEFAULT_CONFIG, MARIA_THRESHOLDS, { ratio, adjust: fakeAdjust(DARKER_PRIMARY) });
    expect(checkLimits(next, MARIA_THRESHOLDS, ratio)).toEqual([]);
  });

  it("nu coboară ce e deja peste prag", () => {
    const big = { ...DEFAULT_CONFIG, minTargetPx: 64, theme: { ...DEFAULT_CONFIG.theme, baseFontPx: 28 } };
    const next = adjustConfigToProfile(big, MARIA_THRESHOLDS, { ratio: fakeContrast(), adjust: fakeAdjust("#000000") });
    expect(next.theme.baseFontPx).toBe(28);
    expect(next.minTargetPx).toBe(64);
  });

  it("textul sub prag se ajustează față de fundal", () => {
    const grey = {
      ...DEFAULT_CONFIG,
      theme: { ...DEFAULT_CONFIG.theme, palette: { ...DEFAULT_CONFIG.theme.palette, text: "#777777" } },
    };
    const adjust = fakeAdjust("#595959");
    const next = adjustConfigToProfile(grey, NORMAL_THRESHOLDS, { ratio: fakeContrast(), adjust });
    expect(adjust.calls).toEqual([["#777777", "#FFFFFF", 4.5]]);
    expect(next.theme.palette.text).toBe("#595959");
  });

  it("fontul minim peste maximul permis se oprește la maxim", () => {
    const next = adjustConfigToProfile(
      DEFAULT_CONFIG,
      { ...NORMAL_THRESHOLDS, minFontPx: 48 },
      {
        ratio: fakeContrast(),
        adjust: fakeAdjust("#000000"),
      },
    );
    expect(next.theme.baseFontPx).toBe(HARD_LIMITS.maxFontPx);
  });

  it("o culoare pe care contrastul n-o înțelege rămâne neatinsă, fără excepție", () => {
    const adjust = fakeAdjust("#000000");
    const next = adjustConfigToProfile(DEFAULT_CONFIG, MARIA_THRESHOLDS, { ratio: fakeContrast({}), adjust });
    expect(adjust.calls).toEqual([]);
    expect(next.theme.palette).toEqual(DEFAULT_CONFIG.theme.palette);
  });
});
