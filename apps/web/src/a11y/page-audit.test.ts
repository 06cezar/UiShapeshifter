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
    <p data-t="nota" style="font-size: 18px; line-height: 1.6">Un fapt<sup data-t="sup" style="display: inline"><a data-t="in-nota" href="#n1" style="display: inline; font-size: 18px" data-rect="0,0,20,15">[1]</a></sup> cu sursă.</p>
    <ul data-t="lista"><li data-t="li"><a data-t="in-lista" href="/y" style="display: inline; font-size: 18px" data-rect="0,0,40,20">Meniu</a></li></ul>
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

  it("sare ce browserul spune că nu se vede (ex. conținutul unui <details> închis)", () => {
    const hidden = document.querySelector<HTMLElement>('[data-t="buton"]')!;
    hidden.checkVisibility = () => false;
    expect(Object.keys(auditPage(THRESHOLDS, OPTIONS).elements)).not.toContain("buton");
  });

  it("suprapunerea cu un element fixed/sticky al site-ului (bannerul de cookie-uri) nu e problemă (găsit de A pe YouTube)", () => {
    page(`
      <div style="position: fixed"><button data-t="cookie" style="font-size: 18px" data-rect="0,0,300,60">Accept</button></div>
      <a data-t="video" href="/v" style="display: block; font-size: 18px" data-rect="0,30,300,60">Un video</a>
      <button data-t="a1" style="font-size: 18px" data-rect="0,100,120,60">Unu</button>
      <button data-t="a2" style="font-size: 18px" data-rect="60,100,120,60">Doi</button>`);
    const overlaps = issuesOf("overlap");
    expect(overlaps).not.toContain("video");
    expect(overlaps).not.toContain("cookie");
    expect(overlaps).toContain("a2"); // două butoane obișnuite una peste alta rămân o problemă
  });

  it("un card derulat în afara unui carusel din ecran nu iese din ecran (găsit de B pe Bing); unul fără carusel, da", () => {
    page(`
      <div style="overflow-x: hidden" data-rect="0,0,1000,100">
        <a data-t="card-vizibil" href="/1" style="display: block; font-size: 18px" data-rect="0,0,300,60">Unu</a>
        <a data-t="card-derulat" href="/2" style="display: block; font-size: 18px" data-rect="1200,0,300,60">Doi</a>
      </div>
      <div style="overflow-x: hidden" data-rect="0,100,3000,100">
        <a data-t="lat" href="/3" style="display: block; font-size: 18px" data-rect="1200,100,300,60">Trei</a>
      </div>
      <a data-t="singur" href="/4" style="display: block; font-size: 18px" data-rect="1200,200,300,60">Patru</a>`);
    const offscreen = issuesOf("offscreen");
    expect(offscreen).not.toContain("card-derulat");
    expect(offscreen).toContain("lat"); // containerul care taie iese el însuși din ecran: nu e carusel
    expect(offscreen).toContain("singur");
  });

  it("textul împins afară cu text-indent (în locul lui e o imagine) nu e tăiat; unul care chiar nu încape, da (găsit de A pe Bing)", () => {
    page(`
      <a data-t="next" href="/p2" style="display: block; overflow: hidden; text-indent: -9999px; font-size: 18px">Pagina următoare</a>
      <p data-t="lung" style="overflow: hidden; font-size: 18px">Un text lung care nu încape în cutia lui</p>`);
    for (const id of ["next", "lung"]) {
      const element = document.querySelector<HTMLElement>(`[data-t="${id}"]`)!;
      Object.defineProperty(element, "clientWidth", { value: 42 });
      Object.defineProperty(element, "scrollWidth", { value: 1032 });
    }
    const clipped = issuesOf("clipped");
    expect(clipped).not.toContain("next");
    expect(clipped).toContain("lung");
  });

  it("un buton tăiat de antetul cu înălțime fixă: clipped, cu fixCss care crește antetul (demo, pasul 4)", () => {
    page(`
      <header data-t="antet" style="height: 40px; overflow: hidden" data-rect="0,0,1000,40">
        <a data-t="scurtatura" href="/plata" style="display: block; font-size: 18px" data-rect="0,0,200,56">Plătește factura</a>
        <a data-t="intreg" href="/cont" style="display: block; font-size: 18px" data-rect="300,0,100,40">Cont</a>
      </header>
      <div style="height: 20px; overflow: hidden" data-rect="0,100,1000,20">
        <p data-t="text" style="font-size: 18px" data-rect="0,100,1000,60">Un paragraf mai înalt decât cutia lui</p>
      </div>`);
    const { report } = withFixCss(auditPage(THRESHOLDS, OPTIONS));
    const clipped = report.issues.filter((issue) => issue.rule === "clipped");
    expect(clipped.map((issue) => issue.elementId)).toEqual(["scurtatura"]);
    expect(clipped[0]!.message).toContain("tăiat de cutia în care stă");
    expect(clipped[0]!.fixCss).toBe(
      '[data-t="antet"]:not(#uis-reparatie) { height: auto !important; max-height: none !important; }',
    );
    // bate o regulă a site-ului pe clasă, chiar cu !important: aplicată, antetul crește
    const header = document.querySelector<HTMLElement>('[data-t="antet"]')!;
    header.classList.add("antet-strimt");
    const site = document.createElement("style");
    site.textContent = ".antet-strimt { height: 40px !important; }";
    const fix = document.createElement("style");
    fix.textContent = clipped[0]!.fixCss!;
    document.head.append(site, fix);
    expect(getComputedStyle(header).height).toBe("auto");
    site.remove();
    fix.remove();
    expect(validateCss(clipped[0]!.fixCss!).dropped).toEqual([]);
  });

  it("linkurile împinse complet sub o secțiune strâmtă ies tăiate; un acordeon închis nu (găsit de A pe #facturi)", () => {
    page(`
      <section data-t="facturi" style="height: 450px; overflow: hidden" data-rect="0,0,1000,450">
        <a data-t="sus" href="/d1" style="display: block; font-size: 18px" data-rect="0,10,100,44">Descarcă</a>
        <a data-t="jos" href="/d6" style="display: block; font-size: 18px" data-rect="0,470,100,44">Descarcă</a>
      </section>
      <div data-t="acordeon" style="max-height: 0; overflow: hidden" data-rect="0,600,1000,0">
        <a data-t="ascuns" href="/x" style="display: block; font-size: 18px" data-rect="0,600,100,44">Detalii</a>
      </div>`);
    const { report } = withFixCss(auditPage(THRESHOLDS, OPTIONS));
    const clipped = report.issues.filter((issue) => issue.rule === "clipped");
    expect(clipped.map((issue) => issue.elementId)).toEqual(["jos"]);
    expect(clipped[0]!.fixCss).toContain('[data-t="facturi"]');
  });

  it("textul pe gradient sau imagine nu e judecat la contrast: fundalul nu se poate măsura", () => {
    page(`<div style="background-color: #ffffff; background-image: linear-gradient(#0b3d91, #1e88e5)">
      <p data-t="pe-gradient" style="color: #ffffff; font-size: 20px; line-height: 1.6">Doar azi</p></div>`);
    expect(issuesOf("contrast")).not.toContain("pe-gradient");
  });

  it("un link din mijlocul unei fraze nu e țintă mică (WCAG 2.5.5); unul de sine stătător, da", () => {
    expect(issuesOf("target-size")).not.toContain("in-fraza");
    expect(issuesOf("target-size")).toContain("link");
  });

  it("o notă de subsol [1] dintr-un <sup> e tot în frază; un link singur într-un <li> de meniu, nu", () => {
    expect(issuesOf("target-size")).not.toContain("in-nota");
    expect(issuesOf("target-size")).toContain("in-lista");
  });

  it("raportul are revizia rețetei, scorul și numărul de elemente verificate", () => {
    const { report } = auditPage(THRESHOLDS, OPTIONS);
    expect(report).toMatchObject({ ok: false, configRevision: 3, checkedAt: "1970-01-01T00:00:00.000Z" });
    expect(report.checkedElements).toBe(9);
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
