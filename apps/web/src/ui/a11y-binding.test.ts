import { describe, expect, it } from "vitest";
import { DEFAULT_PROFILE_NEEDS } from "@uishapeshifter/contracts";
import { createAppConfigStore, realContrastRatio } from "./a11y-binding";
import type { ChangeMeta } from "./config-store";

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
