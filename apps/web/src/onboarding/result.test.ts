import { describe, expect, it } from "vitest";
import {
  buildOnboardingResult,
  minFontFromChoice,
  minTargetFromTouch,
  needsOnboarding,
  normalizeHost,
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
    input: "pointer" as const,
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
  it("cu tastatura nu se măsoară degetul: nu decide nimic", () => {
    const keyboard = trials({ 72: true, 64: true, 56: true, 48: true, 40: true }).map((t) => ({
      ...t,
      input: "keyboard" as const,
    }));
    expect(minTargetFromTouch(keyboard)).toBeUndefined();
    const result = buildOnboardingResult({ touch: keyboard });
    expect(result.needs).toEqual({});
    expect(result.answers).toContainEqual({ questionId: "touch.40.input", answer: "keyboard" });
  });
  it("contează doar apăsările cu degetul, chiar dacă unele au fost cu tastatura", () => {
    const mixed = trials({ 72: true, 64: true, 56: false }).map((t) =>
      t.sizePx === 64 ? { ...t, input: "keyboard" as const } : t,
    );
    expect(minTargetFromTouch(mixed)).toBe(72);
  });
});

describe("site-urile cunoscute", () => {
  it("„alt site” devine host-ul din profil: fără schemă, www., cale sau port, cu litere mici", () => {
    expect(normalizeHost("https://www.Exemplu.ro/pagina?x=1")).toBe("exemplu.ro");
    expect(normalizeHost("  magazin.exemplu.com:8080 ")).toBe("magazin.exemplu.com");
    expect(normalizeHost("exemplu.ro")).toBe("exemplu.ro");
  });
  it("ce nu arată a adresă de site e refuzat", () => {
    for (const bad of ["", "nu știu", "localhost", "exemplu", "http://"]) expect(normalizeHost(bad)).toBeUndefined();
  });
});

describe("buildOnboardingResult", () => {
  const MARIA = buildOnboardingResult({
    fontPx: 20,
    contrast: "high",
    touch: trials({ 72: true, 64: true, 56: true, 48: false, 40: false }),
    dislikes: ["ai-features", "short-video"],
    familiarSites: ["youtube.com", "exemplu.ro"],
    techComfort: "low",
    prefersVoice: true,
  });

  it("rezultatul complet pentru Maria, în forma din contract", () => {
    expect(MARIA).toMatchObject({
      skipped: false,
      needs: { minFontPx: 20, contrast: "high", minTargetPx: 56, prefersVoice: true },
      dislikes: ["ai-features", "short-video"],
      familiarSites: ["youtube.com", "exemplu.ro"],
      persona: { techComfort: "low" },
    });
    expect(MARIA).not.toHaveProperty("preferences"); // structura familiară vine acum din site-urile cunoscute
  });

  it("păstrează răspunsurile brute, cu id-ul întrebării, și măsurătorile de atingere", () => {
    expect(MARIA.answers).toContainEqual({ questionId: "font", answer: 20 });
    expect(MARIA.answers).toContainEqual({ questionId: "touch.48", answer: false });
    expect(MARIA.answers).toContainEqual({ questionId: "touch.48.misses", answer: 1 });
    expect(MARIA.answers).toContainEqual({ questionId: "touch.48.ms", answer: 900 });
    expect(MARIA.answers).toContainEqual({ questionId: "touch.48.input", answer: "pointer" });
    expect(MARIA.answers).toContainEqual({ questionId: "dislikes", answer: "ai-features,short-video" });
    expect(MARIA.answers).toContainEqual({ questionId: "techComfort", answer: "low" });
  });

  it("un pas omis nu schimbă profilul", () => {
    const result = buildOnboardingResult({ fontPx: 24 });
    expect(result.needs).toEqual({ minFontPx: 24 });
    expect(result.persona).toEqual({});
    expect(result).not.toHaveProperty("dislikes");
    expect(result).not.toHaveProperty("familiarSites");
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
      dislikes: ["ai-features"],
    });
    expect(summaryText(result)).toBe(
      "Am pregătit așa: text de 20px, butoane mari, fără rezumate AI. Poți schimba oricând.",
    );
  });
  it("fără răspunsuri", () => {
    expect(summaryText(buildOnboardingResult({}))).toBe("Am păstrat site-urile cum sunt. Poți schimba oricând.");
  });
});
