import { describe, expect, it } from "vitest";
import {
  buildOnboardingResult,
  minFontFromChoice,
  minTargetFromTouch,
  needsOnboarding,
  pinnedModulesFor,
  skippedResult,
  summaryText,
  type TouchTrial,
} from "./result";

function trials(hits: Record<number, boolean>): TouchTrial[] {
  return Object.entries(hits).map(([size, hit]) => ({
    sizePx: Number(size),
    firstTryHit: hit,
    misses: hit ? 0 : 1,
    ms: 900,
  }));
}

describe("needsOnboarding", () => {
  it("doar la un profil nou", () => {
    expect(needsOnboarding({ onboarding: { completed: false, skipped: false } })).toBe(true);
    expect(needsOnboarding({ onboarding: { completed: true, skipped: false } })).toBe(false);
    expect(needsOnboarding({ onboarding: { completed: false, skipped: true } })).toBe(false);
  });
});

describe("lizibilitatea", () => {
  it("fontul ales, niciodată sub 16", () => {
    expect(minFontFromChoice(20)).toBe(20);
    expect(minFontFromChoice(14)).toBe(16);
  });
});

describe("atingerea", () => {
  it("cea mai mică țintă apăsată din prima", () => {
    expect(minTargetFromTouch(trials({ 72: true, 64: true, 56: true, 48: false, 40: false }))).toBe(56);
  });
  it("o nimereală după o ratare nu contează", () => {
    expect(minTargetFromTouch(trials({ 72: true, 64: true, 56: false, 48: false, 40: true }))).toBe(64);
  });
  it("toate din prima: tot minim 44", () => {
    expect(minTargetFromTouch(trials({ 72: true, 64: true, 56: true, 48: true, 40: true }))).toBe(44);
  });
  it("niciuna din prima: cea mai mare țintă", () => {
    expect(minTargetFromTouch(trials({ 72: false, 64: false, 56: false, 48: false, 40: false }))).toBe(72);
  });
  it("ordinea în care au fost apăsate nu contează", () => {
    expect(minTargetFromTouch(trials({ 40: false, 56: true, 72: true, 48: true, 64: true }))).toBe(48);
  });
  it("fără încercări: nu decide nimic", () => {
    expect(minTargetFromTouch([])).toBeUndefined();
  });
});

describe("ce folosești", () => {
  it("fixează modulele cardurilor alese, fără dubluri", () => {
    expect(pinnedModulesFor(["messages", "calls"])).toEqual(["messages", "calls", "contacts"]);
    expect(pinnedModulesFor(["news", "news"])).toEqual(["feed", "stories"]);
  });
});

describe("buildOnboardingResult", () => {
  const MARIA = buildOnboardingResult({
    fontPx: 20,
    contrast: "high",
    touch: trials({ 72: true, 64: true, 56: true, 48: false, 40: false }),
    tasks: ["messages", "photos"],
    layout: "simple-tiles",
    navPosition: "bottom",
    prefersVoice: true,
  });

  it("rezultatul complet pentru Maria", () => {
    expect(MARIA).toMatchObject({
      skipped: false,
      needs: { minFontPx: 20, contrast: "high", minTargetPx: 56, prefersVoice: true },
      preferences: {
        pinnedModules: ["messages", "photos"],
        familiarLayouts: ["simple-tiles"],
        template: "simple-tiles",
        navPosition: "bottom",
      },
      persona: { frequentTasks: ["messages", "photos"] },
    });
  });

  it("păstrează răspunsurile brute, cu id-ul întrebării", () => {
    expect(MARIA.answers).toContainEqual({ questionId: "font", answer: 20 });
    expect(MARIA.answers).toContainEqual({ questionId: "touch.48", answer: false });
    expect(MARIA.answers).toContainEqual({ questionId: "nav", answer: "bottom" });
  });

  it("un pas omis nu schimbă profilul", () => {
    const result = buildOnboardingResult({ fontPx: 24 });
    expect(result.needs).toEqual({ minFontPx: 24 });
    expect(result.preferences).toEqual({});
    expect(result.persona).toEqual({});
  });

  it("„Omite” trimite doar skipped", () => {
    expect(skippedResult()).toEqual({ skipped: true, answers: [] });
  });
});

describe("rezumatul", () => {
  it("ca în specs/10", () => {
    const result = buildOnboardingResult({
      fontPx: 20,
      touch: trials({ 72: true, 64: true, 56: false }),
      navPosition: "bottom",
    });
    expect(summaryText(result)).toBe(
      "Am pregătit aplicația așa: text de 20px, butoane mari, meniul jos. Poți schimba oricând.",
    );
  });
  it("fără răspunsuri", () => {
    expect(summaryText(buildOnboardingResult({}))).toBe("Am păstrat aplicația obișnuită. Poți schimba oricând.");
  });
});
