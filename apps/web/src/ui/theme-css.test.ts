import { describe, expect, it } from "vitest";
import { DEFAULT_CONFIG } from "@uishapeshifter/contracts";
import { themeToCssVars } from "./theme-css";

describe("themeToCssVars", () => {
  it("dă toate variabilele din specs/02 pentru tema implicită", () => {
    expect(themeToCssVars(DEFAULT_CONFIG.theme, DEFAULT_CONFIG.minTargetPx)).toEqual({
      "--font-base": "16px",
      "--line-height": "1.5",
      "--font-family": "system-ui, 'Segoe UI', Roboto, Arial, sans-serif",
      "--radius": "12px",
      "--spacing": "8px",
      "--min-target": "44px",
      "--color-background": "#FFFFFF",
      "--color-surface": "#F3F4F6",
      "--color-text": "#111827",
      "--color-text-muted": "#4B5563",
      "--color-primary": "#C2410C",
      "--color-on-primary": "#FFFFFF",
      "--color-danger": "#B91C1C",
      "--color-focus": "#1D4ED8",
      "--font-step-0": "16px",
      "--font-step-1": "20px",
      "--font-step-2": "25px",
      "--font-step-3": "31.25px",
      "--font-step-4": "39.06px",
    });
  });

  it("treptele urmează baseFontPx și scale", () => {
    const theme = { ...DEFAULT_CONFIG.theme, baseFontPx: 20, scale: 1.5 };
    const vars = themeToCssVars(theme, 56);
    expect(vars["--font-base"]).toBe("20px");
    expect(vars["--font-step-2"]).toBe("45px");
    expect(vars["--min-target"]).toBe("56px");
  });
});
