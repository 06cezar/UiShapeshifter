import { describe, expect, it } from "vitest";
import { DEFAULT_CONFIG } from "@uishapeshifter/contracts";
import type { Theme, UIConfig } from "@uishapeshifter/contracts";
import { validateConfigShape } from "./config-shape";

/**
 * DEFAULT_CONFIG cu o schimbare făcută de mână, fără patch (testăm doar forma).
 * `Object.assign` lasă testul să pună valori de tip greșit fără `any`.
 */
function withChange(change: (c: UIConfig) => void): unknown {
  const copy = structuredClone(DEFAULT_CONFIG);
  change(copy);
  return copy;
}

function violationsAt(candidate: unknown): [string, string][] {
  return validateConfigShape(candidate).map((v) => [v.rule, v.path]);
}

describe("validateConfigShape", () => {
  it("DEFAULT_CONFIG are forma corectă", () => {
    expect(validateConfigShape(DEFAULT_CONFIG)).toEqual([]);
  });

  it("numerele trebuie să fie finite", () => {
    expect(violationsAt(withChange((c) => Object.assign(c.theme, { baseFontPx: "20" })))).toEqual([
      ["invalid-type", "/theme/baseFontPx"],
    ]);
    expect(violationsAt(withChange((c) => Object.assign(c.theme, { scale: Number.NaN })))).toEqual([
      ["invalid-type", "/theme/scale"],
    ]);
    expect(violationsAt(withChange((c) => Object.assign(c, { minTargetPx: Number.POSITIVE_INFINITY })))).toEqual([
      ["invalid-type", "/minTargetPx"],
    ]);
  });

  it("enumerările acceptă doar valorile din contracte", () => {
    expect(violationsAt(withChange((c) => Object.assign(c, { template: "grid" })))).toEqual([
      ["invalid-type", "/template"],
    ]);
    expect(violationsAt(withChange((c) => Object.assign(c.nav, { position: "right" })))).toEqual([
      ["invalid-type", "/nav/position"],
    ]);
    expect(violationsAt(withChange((c) => Object.assign(c.modules[1], { type: "chat" })))).toEqual([
      ["invalid-type", "/modules/1/type"],
    ]);
    expect(violationsAt(withChange((c) => Object.assign(c.modules[1], { size: "xl" })))).toEqual([
      ["invalid-type", "/modules/1/size"],
    ]);
  });

  it("culorile sunt doar #rgb sau #rrggbb", () => {
    expect(violationsAt(withChange((c) => (c.theme.palette.text = "#abc")))).toEqual([]);
    expect(violationsAt(withChange((c) => (c.theme.palette.text = "portocaliu")))).toEqual([
      ["invalid-type", "/theme/palette/text"],
    ]);
    expect(violationsAt(withChange((c) => (c.theme.palette.primary = "#12345")))).toEqual([
      ["invalid-type", "/theme/palette/primary"],
    ]);
    expect(violationsAt(withChange((c) => (c.theme.palette.focus = "rgb(0,0,0)")))).toEqual([
      ["invalid-type", "/theme/palette/focus"],
    ]);
  });

  it("listele au elementele de tipul cerut", () => {
    expect(violationsAt(withChange((c) => Object.assign(c.nav, { items: ["messages", 3] })))).toEqual([
      ["invalid-type", "/nav/items/1"],
    ]);
    expect(violationsAt(withChange((c) => Object.assign(c, { modules: {} })))).toEqual([["invalid-type", "/modules"]]);
    const badPlacement = { componentId: "x", moduleId: "home", position: "left" };
    expect(violationsAt(withChange((c) => Object.assign(c, { placements: [badPlacement] })))).toEqual([
      ["invalid-type", "/placements/0/position"],
    ]);
  });

  it("câmpurile obligatorii lipsă și cele necunoscute se raportează", () => {
    expect(violationsAt(withChange((c) => delete (c.theme as Partial<Theme>).fontFamily))).toEqual([
      ["invalid-type", "/theme/fontFamily"],
    ]);
    expect(violationsAt(withChange((c) => Object.assign(c.theme, { fontSize: 20 })))).toEqual([
      ["invalid-path", "/theme/fontSize"],
    ]);
    expect(violationsAt(withChange((c) => Object.assign(c.modules[0], { pinned: "da" })))).toEqual([
      ["invalid-type", "/modules/0/pinned"],
    ]);
  });

  it("id-urile de modul sunt unice", () => {
    expect(violationsAt(withChange((c) => (c.modules[2].id = "messages")))).toEqual([["duplicate-id", "/modules/2/id"]]);
  });

  it("nu verifică încă conținutul din components (B3)", () => {
    expect(violationsAt(withChange((c) => Object.assign(c, { components: { x: { orice: true } } })))).toEqual([]);
  });

  it("întoarce toate problemele deodată și nu aruncă pe valori absurde", () => {
    const many = withChange((c) => {
      Object.assign(c, { template: "grid" });
      Object.assign(c.theme, { lineHeight: "mare" });
    });
    expect(violationsAt(many)).toHaveLength(2);
    expect(violationsAt(null)).toEqual([["invalid-type", "/"]]);
    expect(violationsAt(42)).toEqual([["invalid-type", "/"]]);
  });
});
