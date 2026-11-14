import { describe, expect, it } from "vitest";
import type { ElementInfo, UISnapshot } from "@uishapeshifter/contracts";
import {
  auditSnapshot,
  checkLineHeight,
  checkMinFont,
  checkNonTextContrast,
  checkOffscreen,
  checkOverlap,
  checkTargetSize,
  checkTextContrast,
  checkClipped,
  computeScore,
  intersectionArea,
  isAgentUi,
  selectElements,
} from "./audit";
import { thresholdsFor } from "./thresholds";

const T = thresholdsFor();
const MARIA = thresholdsFor({ minFontPx: 20, minTargetPx: 48, contrast: "high" });
const VIEWPORT = { width: 400, height: 800 };

function el(over: Partial<ElementInfo> & { id: string }): ElementInfo {
  return {
    role: "button",
    label: "Trimite",
    moduleId: "messages",
    rect: { x: 10, y: 10, width: 120, height: 56 },
    visible: true,
    inViewport: true,
    interactive: true,
    fontPx: 20,
    fontWeight: 400,
    color: "#111827",
    background: "#FFFFFF",
    ...over,
  };
}

function snap(elements: ElementInfo[]): UISnapshot {
  return {
    route: "messages",
    configRevision: 7,
    viewport: VIEWPORT,
    openOverlays: [],
    elements,
    takenAt: "2026-11-13T18:00:00.000Z",
  };
}

const NOW = () => new Date("2026-11-13T18:00:01.000Z");

describe("thresholdsFor", () => {
  it("fără profil: limitele globale", () => {
    expect(T).toEqual({
      minFontPx: 16,
      minContrastText: 4.5,
      minContrastLargeText: 3,
      minTargetPx: 44,
      minLineHeight: 1.5,
    });
  });
  it("profilul Mariei ridică pragurile", () => {
    expect(MARIA).toMatchObject({ minFontPx: 20, minTargetPx: 48, minContrastText: 7, minContrastLargeText: 4.5 });
  });
  it("profilul nu poate coborî sub limite", () => {
    expect(thresholdsFor({ minFontPx: 12, minTargetPx: 30 })).toMatchObject({ minFontPx: 16, minTargetPx: 44 });
  });
});

describe("min-font", () => {
  it("13px e eroare, cu mesaj pe înțeles", () => {
    const [issue] = checkMinFont(el({ id: "messages.send", fontPx: 13 }), T);
    expect(issue).toMatchObject({ rule: "min-font", severity: "error", measured: 13, expected: 16 });
    expect(issue.message).toBe("Butonul „Trimite” are textul de 13px; minimul tău e 16px.");
  });
  it("pragul vine din profil", () => {
    expect(checkMinFont(el({ id: "a", fontPx: 18 }), T)).toHaveLength(0);
    expect(checkMinFont(el({ id: "a", fontPx: 18 }), MARIA)).toHaveLength(1);
  });
  it("ignoră elementele fără text", () => {
    expect(checkMinFont(el({ id: "a", fontPx: 10, label: "" }), T)).toHaveLength(0);
    expect(checkMinFont(el({ id: "a", fontPx: undefined }), T)).toHaveLength(0);
  });
  it("tolerează rotunjirea subpixel", () => {
    expect(checkMinFont(el({ id: "a", fontPx: 15.98 }), T)).toHaveLength(0);
  });
});

describe("contrast", () => {
  it("#777 pe alb: eroare la text normal (4.47 < 4.5)", () => {
    const [issue] = checkTextContrast(el({ id: "a", fontPx: 16, color: "#777777" }), T);
    expect(issue).toMatchObject({ rule: "contrast", severity: "error", measured: 4.47, expected: 4.5 });
  });
  it("#777 pe alb trece la text mare (prag 3)", () => {
    expect(checkTextContrast(el({ id: "a", fontPx: 24, color: "#777777" }), T)).toHaveLength(0);
    expect(checkTextContrast(el({ id: "a", fontPx: 19, fontWeight: 700, color: "#777777" }), T)).toHaveLength(0);
  });
  it("contrast ridicat: 7:1", () => {
    expect(checkTextContrast(el({ id: "a", color: "#595959" }), T)).toHaveLength(0); // ~7.0
    expect(checkTextContrast(el({ id: "a", color: "#666666" }), MARIA)).toHaveLength(1); // 5.74 < 7
  });
  it("folosește contrastul calculat de registru, dacă există", () => {
    expect(checkTextContrast(el({ id: "a", contrast: 2.1 }), T)[0]?.measured).toBe(2.1);
  });
  it("textul decorativ e doar avertisment", () => {
    expect(checkTextContrast(el({ id: "a", color: "#BBBBBB" }), T, { decorative: true })[0]?.severity).toBe("warning");
  });
  it("fără culori nu poate judeca", () => {
    expect(checkTextContrast(el({ id: "a", color: undefined, background: undefined }), T)).toHaveLength(0);
  });
  it("marginea unui buton: sub 3:1 e eroare", () => {
    expect(
      checkNonTextContrast(el({ id: "a" }), { nonText: { color: "#DDDDDD", background: "#FFFFFF" } }),
    ).toHaveLength(1);
    expect(
      checkNonTextContrast(el({ id: "a" }), { nonText: { color: "#888888", background: "#FFFFFF" } }),
    ).toHaveLength(0);
    expect(
      checkNonTextContrast(el({ id: "a", interactive: false }), { nonText: { color: "#EEE", background: "#FFF" } }),
    ).toHaveLength(0);
  });
});

describe("target-size", () => {
  it("40×38 e prea mic", () => {
    const [issue] = checkTargetSize(el({ id: "a", rect: { x: 0, y: 0, width: 40, height: 38 } }), T);
    expect(issue).toMatchObject({ rule: "target-size", severity: "error", measured: "40×38px", expected: 44 });
  });
  it("44×44 trece normal, dar nu pentru Maria (48)", () => {
    const e = el({ id: "a", rect: { x: 0, y: 0, width: 44, height: 44 } });
    expect(checkTargetSize(e, T)).toHaveLength(0);
    expect(checkTargetSize(e, MARIA)).toHaveLength(1);
  });
  it("ignoră elementele neinteractive", () => {
    expect(
      checkTargetSize(el({ id: "a", interactive: false, rect: { x: 0, y: 0, width: 10, height: 10 } }), T),
    ).toHaveLength(0);
  });
});

describe("overlap", () => {
  it("aria intersecției", () => {
    expect(intersectionArea({ x: 0, y: 0, width: 10, height: 10 }, { x: 5, y: 5, width: 10, height: 10 })).toBe(25);
    expect(intersectionArea({ x: 0, y: 0, width: 10, height: 10 }, { x: 10, y: 0, width: 10, height: 10 })).toBe(0);
  });
  it("două butoane care se acoperă", () => {
    const issues = checkOverlap([
      el({ id: "a", rect: { x: 0, y: 0, width: 60, height: 60 } }),
      el({ id: "b", rect: { x: 50, y: 0, width: 60, height: 60 } }),
    ]);
    expect(issues).toHaveLength(1);
    expect(issues[0]).toMatchObject({ rule: "overlap", elementId: "b", measured: "600px² cu a" });
  });
  it("până la 4px² nu contează (margini care se ating)", () => {
    expect(
      checkOverlap([
        el({ id: "a", rect: { x: 0, y: 0, width: 60, height: 60 } }),
        el({ id: "b", rect: { x: 58, y: 58, width: 60, height: 60 } }),
      ]),
    ).toHaveLength(0);
  });
  it("un buton în interiorul unei plăci nu e suprapunere", () => {
    expect(
      checkOverlap([
        el({ id: "home.calls", rect: { x: 0, y: 0, width: 300, height: 200 } }),
        el({ id: "calls.ana", rect: { x: 20, y: 20, width: 100, height: 60 } }),
      ]),
    ).toHaveLength(0);
  });
});

describe("clipped, offscreen, line-height", () => {
  it("text tăiat e eroare, dar nu cu text-overflow intenționat", () => {
    expect(checkClipped(el({ id: "a", clipped: true }))).toHaveLength(1);
    expect(checkClipped(el({ id: "a", clipped: true }), { intentionalOverflow: true })).toHaveLength(0);
    expect(checkClipped(el({ id: "a", clipped: false }))).toHaveLength(0);
  });
  it("buton care iese din ecran pe orizontală", () => {
    expect(checkOffscreen(el({ id: "a", rect: { x: 350, y: 0, width: 100, height: 50 } }), VIEWPORT)).toHaveLength(1);
    expect(checkOffscreen(el({ id: "a", rect: { x: -20, y: 0, width: 100, height: 50 } }), VIEWPORT)).toHaveLength(1);
    // sub ecran (pe verticală) e în regulă: se ajunge prin derulare
    expect(checkOffscreen(el({ id: "a", rect: { x: 10, y: 2000, width: 100, height: 50 } }), VIEWPORT)).toHaveLength(0);
  });
  it("line-height sub 1.5 la textul de conținut e avertisment", () => {
    const p = el({ id: "chat.ana.msg", role: "text", interactive: false });
    expect(checkLineHeight(p, T, { lineHeight: 1.2 })[0]).toMatchObject({
      rule: "line-height",
      severity: "warning",
      measured: 1.2,
    });
    expect(checkLineHeight(p, T, { lineHeight: 1.5 })).toHaveLength(0);
    expect(checkLineHeight(p, T, { lineHeight: 1.2, singleLine: true })).toHaveLength(0); // o etichetă pe un rând
    expect(checkLineHeight(el({ id: "b" }), T, { lineHeight: 1.2 })).toHaveLength(0); // buton
    expect(checkLineHeight(el({ id: "h", role: "heading", interactive: false }), T, { lineHeight: 1.1 })).toHaveLength(
      0,
    );
  });
});

describe("scorul", () => {
  it("100 − 8 × erori − 2 × avertismente, minim 0", () => {
    expect(computeScore([])).toBe(100);
    expect(computeScore([{ severity: "error" }, { severity: "error" }, { severity: "warning" }])).toBe(82);
    expect(computeScore(Array.from({ length: 20 }, () => ({ severity: "error" as const })))).toBe(0);
  });
});

describe("auditSnapshot", () => {
  const elements = [
    el({ id: "nav.messages", moduleId: "nav", label: "Mesaje" }),
    el({ id: "messages.send", fontPx: 13, rect: { x: 10, y: 100, width: 40, height: 40 } }), // 2 erori
    el({ id: "messages.compose", role: "textbox", label: "Scrie", rect: { x: 10, y: 200, width: 300, height: 56 } }),
    el({ id: "photos.share", moduleId: "photos", fontPx: 10 }), // alt modul
    el({ id: "messages.hidden", visible: false, fontPx: 8 }), // invizibil
    el({ id: "mascot", role: "img", label: "Vulpița", rect: { x: 10, y: 100, width: 40, height: 40 } }), // agentul
  ];

  it("raportul complet, pe modulul curent", () => {
    const report = auditSnapshot(snap(elements), T, { moduleId: "messages", now: NOW });
    expect(report.ok).toBe(false);
    expect(report.issues.map((i) => `${i.rule}:${i.elementId}`).sort()).toEqual([
      "min-font:messages.send",
      "target-size:messages.send",
    ]);
    expect(report.score).toBe(84);
    expect(report.checkedElements).toBe(3);
    expect(report.configRevision).toBe(7);
    expect(report.checkedAt).toBe("2026-11-13T18:00:01.000Z");
    expect(report.thresholds).toBe(T);
  });

  it("fără modul: tot ce e vizibil, fără interfața agentului", () => {
    const report = auditSnapshot(snap(elements), T, { now: NOW });
    expect(report.checkedElements).toBe(4);
    expect(report.issues.some((i) => i.elementId === "photos.share")).toBe(true);
    expect(report.issues.some((i) => i.elementId === "mascot")).toBe(false);
  });

  it("interfața agentului se verifică separat", () => {
    expect(selectElements(snap(elements), { scope: "agent" }).map((e) => e.id)).toEqual(["mascot"]);
    expect(isAgentUi("chat-panel.input")).toBe(true);
    expect(isAgentUi("chat.ana")).toBe(false);
  });

  it("avertismentele nu strică ok", () => {
    const p = el({ id: "chat.ana.msg", role: "text", interactive: false });
    const report = auditSnapshot(snap([p]), T, { facts: { "chat.ana.msg": { lineHeight: 1.2 } }, now: NOW });
    expect(report).toMatchObject({ ok: true, score: 98 });
  });

  it("o interfață curată are 100", () => {
    const report = auditSnapshot(snap([elements[0], elements[2]]), T, { now: NOW });
    expect(report).toMatchObject({ ok: true, score: 100, issues: [] });
  });
});
