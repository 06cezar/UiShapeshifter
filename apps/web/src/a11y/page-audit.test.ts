import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { AuditIssue } from "@uishapeshifter/contracts";
import { validateCss } from "../validation";
import { contrastRatio } from "./contrast";
import { fixCssFor, withFixCss } from "./fix-css";
import { auditWithoutRecipe, introducedIssues } from "./introduced";
import { auditPage, MAX_AUDITED_ELEMENTS, type PageAuditOptions, type PageIdentity } from "./page-audit";
import { thresholdsFor } from "./thresholds";

const HOST_ID = "uishapeshifter-root";
const THRESHOLDS = thresholdsFor({ minFontPx: 16, minTargetPx: 44 });

/** Registrul paginii, simplificat: id-ul și selectorul vin din `data-t`. */
const identity: PageIdentity = {
  idOf: (el) => el.getAttribute("data-t") ?? `fără-id:${el.localName}`,
  selectorOf: (el) => `[data-t="${el.getAttribute("data-t")}"]`,
};
const OPTIONS: PageAuditOptions = { identity, ourHostId: HOST_ID, revision: 3, now: () => new Date(0) };

/** happy-dom nu face layout: fiecare element primește mărimea din `data-rect="x,y,lățime,înălțime"`. */
function page(html: string): void {
  document.body.innerHTML = html;
  for (const el of document.querySelectorAll<HTMLElement>("*")) {
    const [x, y, width, height] = (el.dataset.rect ?? "0,0,300,30").split(",").map(Number);
    el.getBoundingClientRect = () => new DOMRect(x, y, width, height);
  }
}

function issuesOf(rule: AuditIssue["rule"]): string[] {
  return auditPage(THRESHOLDS, OPTIONS)
    .report.issues.filter((issue) => issue.rule === rule)
    .map((issue) => issue.elementId);
}

beforeEach(() => {
  page(`
    <header><p data-t="titlu" style="font-size: 20px; line-height: 1.6">Bun venit</p></header>
    <p data-t="mic" style="font-size: 12px; line-height: 1.6">Text mărunt</p>
    <a data-t="link" href="/cos" style="display: inline; color: #999999; font-size: 18px" data-rect="0,40,60,20">Coș</a>
    <button data-t="buton" style="font-size: 16px" data-rect="0,80,30,30">OK</button>
    <p data-t="ascuns" style="display: none; font-size: 10px">nu se vede</p>
    <p data-t="fraza" style="font-size: 18px; line-height: 1.6">Vezi <a data-t="in-fraza" href="/x" style="display: inline; font-size: 18px" data-rect="0,0,40,20">aici</a> detalii.</p>
    <span data-t="sr-only" style="font-size: 12px" data-rect="0,0,1,1">Meniul principal</span>
    <div id="${HOST_ID}"><p data-t="mascota" style="font-size: 10px">a noastră</p></div>`);
});

afterEach(() => {
  document.body.innerHTML = "";
  document.head.innerHTML = "";
});

describe("auditPage pe un site", () => {
  it("găsește fontul mic, ținta mică și contrastul slab, pe elementele site-ului", () => {
    expect(issuesOf("min-font")).toEqual(["mic"]);
    expect(issuesOf("target-size")).toEqual(expect.arrayContaining(["link", "buton"]));
    expect(issuesOf("contrast")).toEqual(["link"]);
  });

  it("sare interfața noastră, elementele ascunse și textul doar pentru cititorul de ecran (1×1px)", () => {
    const { elements } = auditPage(THRESHOLDS, OPTIONS);
    expect(Object.keys(elements)).not.toContain("mascota");
    expect(Object.keys(elements)).not.toContain("ascuns");
    expect(Object.keys(elements)).not.toContain("sr-only");
  });

  it("un link din mijlocul unei fraze nu e țintă mică (WCAG 2.5.5); unul de sine stătător, da", () => {
    expect(issuesOf("target-size")).not.toContain("in-fraza");
    expect(issuesOf("target-size")).toContain("link");
  });

  it("raportul are revizia rețetei, scorul și numărul de elemente verificate", () => {
    const { report } = auditPage(THRESHOLDS, OPTIONS);
    expect(report).toMatchObject({ ok: false, configRevision: 3, checkedAt: "1970-01-01T00:00:00.000Z" });
    expect(report.checkedElements).toBe(6);
    expect(report.score).toBeLessThan(100);
  });

  it(`măsoară cel mult ${MAX_AUDITED_ELEMENTS} de elemente, cele din ecran întâi`, () => {
    const below = Array.from(
      { length: MAX_AUDITED_ELEMENTS },
      (_, i) => `<p data-t="jos${i}" data-rect="0,5000,300,30">x</p>`,
    );
    page(`${below.join("")}<p data-t="sus" data-rect="0,10,300,30">în ecran</p>`);
    const { elements } = auditPage(THRESHOLDS, OPTIONS);
    expect(Object.keys(elements)).toHaveLength(MAX_AUDITED_ELEMENTS);
    expect(elements.sus?.inViewport).toBe(true);
  });
});

describe("fixCss", () => {
  it("fontul mic → font-size la minim, pe selectorul elementului", () => {
    const { report } = withFixCss(auditPage(THRESHOLDS, OPTIONS));
    const small = report.issues.find((issue) => issue.rule === "min-font");
    expect(small?.fixCss).toBe('[data-t="mic"] { font-size: 16px !important; }');
  });

  it("ținta mică → min-height și min-width; un link inline primește și inline-block", () => {
    const { report } = withFixCss(auditPage(THRESHOLDS, OPTIONS));
    const link = report.issues.find((issue) => issue.rule === "target-size" && issue.elementId === "link");
    expect(link?.fixCss).toBe(
      '[data-t="link"] { display: inline-block !important; min-height: 44px !important; min-width: 44px !important; }',
    );
  });

  it("contrastul → aceeași nuanță, care atinge pragul pe fundalul elementului", () => {
    const { report, elements } = withFixCss(auditPage(THRESHOLDS, OPTIONS));
    const fixCss = report.issues.find((issue) => issue.rule === "contrast")?.fixCss ?? "";
    const color = /color: (#[0-9A-Fa-f]{6})/.exec(fixCss)?.[1];
    expect(color).toBeDefined();
    expect(contrastRatio(color!, elements.link.background!)).toBeGreaterThanOrEqual(4.5);
  });

  it("orice fixCss trece de validarea CSS (C5), deci apply_css nu-l scoate", () => {
    const { report } = withFixCss(auditPage(THRESHOLDS, OPTIONS));
    const fixes = report.issues.flatMap((issue) => (issue.fixCss ? [issue.fixCss] : []));
    expect(fixes.length).toBeGreaterThan(0);
    for (const css of fixes) expect(validateCss(css).dropped).toEqual([]);
  });

  it("textul tăiat, suprapunerea și ce iese din ecran rămân fără fixCss: decide agentul", () => {
    for (const rule of ["clipped", "overlap", "offscreen"] as const) {
      const issue: AuditIssue = { rule, severity: "error", elementId: "x", measured: 0, expected: 0, message: "" };
      expect(
        fixCssFor(
          issue,
          {
            id: "x",
            role: "p",
            label: "",
            rect: { x: 0, y: 0, width: 1, height: 1 },
            visible: true,
            inViewport: true,
            interactive: false,
          },
          "p",
          THRESHOLDS,
        ),
      ).toBeUndefined();
    }
  });
});

describe("ce a stricat agentul", () => {
  it("o regulă a rețetei care micșorează textul apare ca nouă; ce era deja mic, nu", () => {
    const recipe = document.createElement("style");
    recipe.textContent = '[data-t="titlu"] { font-size: 11px !important; }';
    document.head.append(recipe);

    // În extensie motorul face `style.disabled`; happy-dom nu-l respectă la stilurile calculate, deci golim foaia.
    const pauseRecipe = () => {
      const css = recipe.textContent;
      recipe.textContent = "";
      return () => {
        recipe.textContent = css;
      };
    };

    const now = auditPage(THRESHOLDS, OPTIONS).report;
    const original = auditWithoutRecipe(THRESHOLDS, { ...OPTIONS, pauseRecipe }).report;
    const introduced = introducedIssues(now, original);

    expect(introduced.map((issue) => `${issue.rule}:${issue.elementId}`)).toEqual(["min-font:titlu"]);
    expect(recipe.textContent).toContain("11px"); // rețeta a fost pornită la loc
  });

  it("fără foaie de rețetă, pagina de acum e chiar cea originală: nimic nou", () => {
    const now = auditPage(THRESHOLDS, OPTIONS).report;
    const original = auditWithoutRecipe(THRESHOLDS, OPTIONS).report;
    expect(introducedIssues(now, original)).toEqual([]);
  });
});
