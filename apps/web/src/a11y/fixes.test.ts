import { describe, expect, it } from "vitest";
import { DEFAULT_CONFIG } from "@uishapeshifter/contracts";
import type { AuditIssue, ElementInfo, UIConfig, UISnapshot } from "@uishapeshifter/contracts";
import { applyPatchWithLimits } from "../ui/limit-gate";
import { auditSnapshot } from "./audit";
import { contrastRatio } from "./contrast";
import { mergeFixes, proposeFix, withFixes } from "./fixes";
import { thresholdsFor } from "./thresholds";

const NORMAL = thresholdsFor();
const BIG_FONT = thresholdsFor({ minFontPx: 20, minTargetPx: 56 });
const MARIA = thresholdsFor({ minFontPx: 20, minTargetPx: 56, contrast: "high" });
const palette = DEFAULT_CONFIG.theme.palette;

function el(over: Partial<ElementInfo> & { id: string }): ElementInfo {
  return {
    role: "text",
    label: "Ana: Ce faci, bunico?",
    moduleId: "messages",
    rect: { x: 10, y: 10, width: 200, height: 56 },
    visible: true,
    inViewport: true,
    interactive: false,
    fontPx: 20,
    fontWeight: 400,
    color: palette.text,
    background: palette.background,
    ...over,
  };
}

function issue(rule: AuditIssue["rule"], elementId = "x"): AuditIssue {
  return { rule, severity: "error", elementId, measured: 0, expected: 0, message: "" };
}

function config(over: (c: UIConfig) => void = () => {}): UIConfig {
  const c = structuredClone(DEFAULT_CONFIG);
  over(c);
  return c;
}

describe("min-font", () => {
  it("fontul de bază urcă la minimul utilizatorului", () => {
    expect(proposeFix(issue("min-font"), undefined, config(), BIG_FONT)).toEqual([
      { op: "replace", path: "/theme/baseFontPx", value: 20 },
    ]);
  });
  it("fontul de bază e deja la minim: textul mic nu vine din temă, fără fix", () => {
    expect(proposeFix(issue("min-font"), undefined, config(), NORMAL)).toBeUndefined();
  });
  it("profil peste maximul permis: fără fix (poarta l-ar refuza oricum)", () => {
    expect(proposeFix(issue("min-font"), undefined, config(), { ...BIG_FONT, minFontPx: 48 })).toBeUndefined();
  });
});

describe("target-size și line-height", () => {
  it("minTargetPx urcă la prag", () => {
    expect(proposeFix(issue("target-size"), undefined, config(), BIG_FONT)).toEqual([
      { op: "replace", path: "/minTargetPx", value: 56 },
    ]);
  });
  it("config-ul e deja la prag: ținta mică vine din alt loc, fără fix", () => {
    expect(proposeFix(issue("target-size"), undefined, config(), NORMAL)).toBeUndefined();
  });
  it("lineHeight din temă sub minim", () => {
    const low = config((c) => (c.theme.lineHeight = 1.2));
    expect(proposeFix(issue("line-height"), undefined, low, NORMAL)).toEqual([
      { op: "replace", path: "/theme/lineHeight", value: 1.5 },
    ]);
  });
  it("overlap, offscreen, clipped: decide agentul", () => {
    for (const rule of ["overlap", "offscreen", "clipped"] as const) {
      expect(proposeFix(issue(rule), el({ id: "x" }), config(), NORMAL)).toBeUndefined();
    }
  });
});

describe("contrast", () => {
  it("textul secundar pe suprafață, cu contrast mare: textMuted mai închis, trece pe ambele fundaluri", () => {
    const muted = el({ id: "x", color: palette.textMuted, background: palette.surface });
    expect(contrastRatio(palette.textMuted, palette.surface)).toBeLessThan(7); // premisa testului
    const fix = proposeFix(issue("contrast"), muted, config(), MARIA);
    expect(fix).toHaveLength(1);
    expect(fix?.[0].path).toBe("/theme/palette/textMuted");
    const fixed = String(fix?.[0].value);
    expect(contrastRatio(fixed, palette.surface)).toBeGreaterThanOrEqual(7);
    expect(contrastRatio(fixed, palette.background)).toBeGreaterThanOrEqual(7);
  });

  it("butonul principal: schimbă primary, nu textul alb de pe el", () => {
    const button = el({
      id: "messages.send",
      interactive: true,
      color: palette.onPrimary,
      background: palette.primary,
    });
    const fix = proposeFix(issue("contrast"), button, config(), MARIA);
    expect(fix?.map((op) => op.path)).toEqual(["/theme/palette/primary"]);
    expect(contrastRatio(palette.onPrimary, String(fix?.[0].value))).toBeGreaterThanOrEqual(7);
  });

  it("recunoaște culorile scrise ca rgb() de getComputedStyle", () => {
    const button = el({ id: "b", color: "rgb(255, 255, 255)", background: "rgb(194, 65, 12)" });
    expect(proposeFix(issue("contrast"), button, config(), MARIA)?.[0].path).toBe("/theme/palette/primary");
  });

  it("culori care nu vin din temă: fără fix", () => {
    const generated = el({ id: "gen.x", color: "#999999", background: "#FFFFFF" });
    expect(proposeFix(issue("contrast"), generated, config(), NORMAL)).toBeUndefined();
  });

  it("textul trece: issue-ul era la margine (WCAG 1.4.11), fără fix", () => {
    expect(proposeFix(issue("contrast"), el({ id: "x" }), config(), NORMAL)).toBeUndefined();
  });

  it("fără element în snapshot: fără fix", () => {
    expect(proposeFix(issue("contrast"), undefined, config(), NORMAL)).toBeUndefined();
  });
});

describe("mergeFixes", () => {
  it("o singură operație pe cale; la numere, cea mai mare", () => {
    const merged = mergeFixes([
      { fix: [{ op: "replace", path: "/minTargetPx", value: 48 }] },
      { fix: [{ op: "replace", path: "/minTargetPx", value: 56 }] },
      { fix: undefined },
      { fix: [{ op: "replace", path: "/minTargetPx", value: 50 }] },
    ]);
    expect(merged).toEqual([{ op: "replace", path: "/minTargetPx", value: 56 }]);
  });
});

describe("cap-coadă: auditul Mariei pe tema implicită, reparat și trecut prin poarta din store", () => {
  // Interfața implicită (16px, ținte 44px, butonul portocaliu) văzută cu pragurile Mariei: 20px, 56px, contrast 7.
  const snapshot: UISnapshot = {
    route: "messages",
    configRevision: 3,
    viewport: { width: 400, height: 800 },
    openOverlays: [],
    takenAt: "2026-11-13T20:00:00.000Z",
    elements: [
      el({ id: "chat.ana.msg", fontPx: 16 }),
      el({ id: "messages.preview", fontPx: 16, color: palette.textMuted, background: palette.surface }),
      el({
        id: "messages.send",
        role: "button",
        label: "Trimite",
        interactive: true,
        fontPx: 16,
        rect: { x: 10, y: 100, width: 120, height: 44 },
        color: palette.onPrimary,
        background: palette.primary,
      }),
    ],
  };

  const report = withFixes(auditSnapshot(snapshot, MARIA), snapshot, DEFAULT_CONFIG);

  it("fiecare problemă din temă are reparația ei", () => {
    const rules = report.issues.map((i) => `${i.rule}:${i.elementId}:${i.fix ? "fix" : "-"}`).sort();
    expect(rules).toEqual([
      "contrast:messages.preview:fix",
      "contrast:messages.send:fix",
      "min-font:chat.ana.msg:fix",
      "min-font:messages.preview:fix",
      "min-font:messages.send:fix",
      "target-size:messages.send:fix",
    ]);
  });

  it("patch-ul combinat trece de poarta reală din store", () => {
    const patch = mergeFixes(report.issues);
    expect(patch.map((op) => op.path).sort()).toEqual([
      "/minTargetPx",
      "/theme/baseFontPx",
      "/theme/palette/primary",
      "/theme/palette/textMuted",
    ]);
    const gated = applyPatchWithLimits(DEFAULT_CONFIG, patch, MARIA, contrastRatio);
    expect(gated.ok).toBe(true);
  });

  it("fără reparații, tema implicită e refuzată de poartă pentru Maria (premisa)", () => {
    expect(applyPatchWithLimits(DEFAULT_CONFIG, [], MARIA, contrastRatio).ok).toBe(false);
  });
});
