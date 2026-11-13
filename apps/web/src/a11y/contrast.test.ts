import { describe, expect, it } from "vitest";
import {
  adjustToContrast,
  composite,
  contrastRatio,
  formatRatio,
  isLargeText,
  parseColor,
  relativeLuminance,
  requiredTextContrast,
  toHex,
} from "./contrast";
import { DEFAULT_CONFIG } from "@uishapeshifter/contracts";

describe("parseColor", () => {
  it("citește hex scurt, lung și cu alfa", () => {
    expect(parseColor("#fff")).toEqual({ r: 255, g: 255, b: 255, a: 1 });
    expect(parseColor("#777777")).toEqual({ r: 119, g: 119, b: 119, a: 1 });
    expect(parseColor("#00000080")?.a).toBeCloseTo(0.502, 3);
  });
  it("citește rgb()/rgba() cu virgule sau spații", () => {
    expect(parseColor("rgb(17, 24, 39)")).toEqual({ r: 17, g: 24, b: 39, a: 1 });
    expect(parseColor("rgba(0, 0, 0, 0.5)")).toEqual({ r: 0, g: 0, b: 0, a: 0.5 });
    expect(parseColor("rgb(0 0 0 / 50%)")).toEqual({ r: 0, g: 0, b: 0, a: 0.5 });
  });
  it("întoarce null pentru ce nu înțelege", () => {
    expect(parseColor("portocaliu")).toBeNull();
    expect(parseColor("#12")).toBeNull();
  });
  it("toHex dă #RRGGBB", () => {
    expect(toHex({ r: 194, g: 65, b: 12, a: 1 })).toBe("#C2410C");
  });
});

describe("contrastRatio", () => {
  it("valorile cunoscute", () => {
    expect(contrastRatio("#000000", "#FFFFFF")).toBeCloseTo(21, 5);
    expect(contrastRatio("#FFFFFF", "#FFFFFF")).toBeCloseTo(1, 5);
    expect(contrastRatio("#777777", "#FFFFFF")).toBeCloseTo(4.48, 2);
    expect(contrastRatio("#767676", "#FFFFFF")).toBeCloseTo(4.54, 2);
  });
  it("#777 pe alb NU trece de 4.5 (nu se rotunjește în sus)", () => {
    expect(contrastRatio("#777", "#fff")).toBeLessThan(4.5);
    expect(formatRatio(contrastRatio("#777", "#fff"))).toBe(4.47);
  });
  it("e simetric", () => {
    expect(contrastRatio("#C2410C", "#FFFFFF")).toBeCloseTo(contrastRatio("#FFFFFF", "#C2410C"), 10);
  });
  it("compune textul semitransparent peste fundal", () => {
    const half = contrastRatio("rgba(0,0,0,0.5)", "#FFFFFF");
    const mixed = composite({ r: 0, g: 0, b: 0, a: 0.5 }, { r: 255, g: 255, b: 255, a: 1 });
    expect(mixed.r).toBeCloseTo(127.5, 5);
    expect(half).toBeCloseTo(contrastRatio(mixed, "#FFFFFF"), 5);
    expect(half).toBeLessThan(21);
  });
  it("luminanța relativă: negru 0, alb 1", () => {
    expect(relativeLuminance("#000")).toBe(0);
    expect(relativeLuminance("#fff")).toBeCloseTo(1, 10);
  });
  it("paleta implicită trece pragurile din poartă", () => {
    const p = DEFAULT_CONFIG.theme.palette;
    expect(contrastRatio(p.text, p.background)).toBeGreaterThanOrEqual(4.5);
    expect(contrastRatio(p.onPrimary, p.primary)).toBeGreaterThanOrEqual(4.5);
  });
});

describe("text mare și praguri", () => {
  it("24px normal sau 18.66px bold e text mare", () => {
    expect(isLargeText(24)).toBe(true);
    expect(isLargeText(23.9)).toBe(false);
    expect(isLargeText(18.66, 700)).toBe(true);
    expect(isLargeText(18.66, 400)).toBe(false);
  });
  it("pragul depinde de mărime", () => {
    expect(requiredTextContrast(16, 400)).toBe(4.5);
    expect(requiredTextContrast(24, 400)).toBe(3);
    expect(requiredTextContrast(16, 400, { minContrastText: 7, minContrastLargeText: 4.5 })).toBe(7);
    expect(requiredTextContrast(undefined, undefined)).toBe(4.5);
  });
});

describe("adjustToContrast", () => {
  it("lasă neschimbată o culoare care trece deja", () => {
    expect(adjustToContrast("#111827", "#FFFFFF", 4.5)).toBe("#111827");
  });
  it("închide #777 pe alb până la 4.5, aproape de original", () => {
    const fixed = adjustToContrast("#777777", "#FFFFFF", 4.5);
    expect(contrastRatio(fixed, "#FFFFFF")).toBeGreaterThanOrEqual(4.5);
    const grey = parseColor(fixed)!;
    expect(grey.r).toBe(grey.g); // aceeași nuanță (gri)
    expect(grey.r).toBeGreaterThanOrEqual(0x70); // schimbare mică, nu negru
  });
  it("păstrează nuanța: portocaliu deschis devine portocaliu închis", () => {
    const fixed = adjustToContrast("#F59E0B", "#FFFFFF", 4.5);
    const c = parseColor(fixed)!;
    expect(contrastRatio(fixed, "#FFFFFF")).toBeGreaterThanOrEqual(4.5);
    expect(c.r).toBeGreaterThan(c.g);
    expect(c.g).toBeGreaterThan(c.b);
  });
  it("deschide textul pe fundal închis", () => {
    const fixed = adjustToContrast("#555555", "#111111", 7);
    expect(contrastRatio(fixed, "#111111")).toBeGreaterThanOrEqual(7);
    expect(relativeLuminance(fixed)).toBeGreaterThan(relativeLuminance("#555555"));
  });
  it("cu prag imposibil pe gri mediu alege negru sau alb", () => {
    expect(["#000000", "#FFFFFF"]).toContain(adjustToContrast("#808080", "#777777", 21));
  });
});
