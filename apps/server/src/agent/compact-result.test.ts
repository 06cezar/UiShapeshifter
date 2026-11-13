import { describe, expect, it } from "vitest";
import { compactResult } from "./compact-result";

describe("compactResult", () => {
  it("auditul păstrează doar ce trebuie reparat: introduced și fixCss, fără praguri", () => {
    const text = compactResult("audit_ui", {
      ok: true,
      data: {
        ok: false,
        score: 81,
        issues: [
          {
            rule: "target-size",
            severity: "error",
            elementId: "e.4",
            measured: 30,
            expected: 44,
            message: "Butonul are 30px.",
            fixCss: "a.btn{min-height:44px}",
            introduced: true,
          },
          {
            rule: "contrast",
            severity: "warning",
            elementId: "e.9",
            measured: 3,
            expected: 4.5,
            message: "Contrast mic.",
          },
        ],
        thresholds: {
          minFontPx: 16,
          minContrastText: 4.5,
          minContrastLargeText: 3,
          minTargetPx: 44,
          minLineHeight: 1.5,
        },
        checkedElements: 40,
        configRevision: 2,
        checkedAt: "2026-11-13T20:00:00.000Z",
      },
    });
    expect(JSON.parse(text)).toEqual({
      ok: true,
      data: {
        ok: false,
        score: 81,
        issues: [
          {
            rule: "target-size",
            severity: "error",
            elementId: "e.4",
            message: "Butonul are 30px.",
            fixCss: "a.btn{min-height:44px}",
            introduced: true,
          },
          { rule: "contrast", severity: "warning", elementId: "e.9", message: "Contrast mic." },
        ],
      },
    });
  });
});
