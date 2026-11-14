import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { parseAuditArgs, runAuditUi, type AuditToolDeps } from "./audit-tool";
import { thresholdsFor } from "./thresholds";

const HOST_ID = "uishapeshifter-root";

let recipe: HTMLStyleElement;
let deps: AuditToolDeps;

beforeEach(() => {
  document.body.innerHTML = `
    <nav data-t="r.nav"><a data-t="acasa" href="/" style="display: inline; font-size: 18px">Acasă</a></nav>
    <main data-t="r.main">
      <p data-t="vechi" style="font-size: 12px; line-height: 1.6">Era mic de la site</p>
      <p data-t="stricat" style="font-size: 18px; line-height: 1.6">Agentul îl micșorează</p>
    </main>`;
  for (const el of document.querySelectorAll<HTMLElement>("*")) {
    el.getBoundingClientRect = () => new DOMRect(0, 0, 300, 30);
  }
  recipe = document.createElement("style");
  recipe.textContent = '[data-t="stricat"] { font-size: 12px !important; }';
  document.head.append(recipe);

  deps = {
    thresholds: () => thresholdsFor({ minFontPx: 16 }),
    identity: {
      idOf: (el) => el.getAttribute("data-t") ?? "?",
      selectorOf: (el) => `[data-t="${el.getAttribute("data-t")}"]`,
    },
    ourHostId: HOST_ID,
    revision: () => 5,
    regionElement: (id) => document.querySelector(`[data-t="${id}"]`) ?? undefined,
    // happy-dom nu respectă `style.disabled` la stilurile calculate, deci golim foaia (în extensie: disabled).
    pauseRecipe: () => {
      const css = recipe.textContent;
      recipe.textContent = "";
      return () => {
        recipe.textContent = css;
      };
    },
  };
});

afterEach(() => {
  document.body.innerHTML = "";
  document.head.innerHTML = "";
});

describe("audit_ui pe un site", () => {
  it("marchează cu introduced doar ce a adus rețeta agentului, și pune fixCss", () => {
    const result = runAuditUi({}, deps);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const fonts = result.data.issues.filter((issue) => issue.rule === "min-font");
    expect(fonts.map((issue) => [issue.elementId, issue.introduced ?? false])).toEqual([
      ["vechi", false],
      ["stricat", true],
    ]);
    expect(fonts.every((issue) => issue.fixCss?.includes("font-size: 16px"))).toBe(true);
    expect(result.data.configRevision).toBe(5);
  });

  it("{ regionId } verifică doar zona aceea", () => {
    const result = runAuditUi({ regionId: "r.nav" }, deps);
    expect(result.ok && result.data.issues.map((issue) => issue.elementId)).toEqual(["acasa"]);
  });

  it("zonă necunoscută → ELEMENT_NOT_FOUND, cu unde găsește zonele", () => {
    const result = runAuditUi({ regionId: "r.nu-exista" }, deps);
    expect(result).toMatchObject({ ok: false, error: { code: "ELEMENT_NOT_FOUND" } });
  });

  it("fără pauseRecipe nu poate ști ce a adus agentul: nimic nu e introduced", () => {
    const result = runAuditUi({}, { ...deps, pauseRecipe: undefined });
    expect(result.ok && result.data.issues.some((issue) => issue.introduced)).toBe(false);
  });

  it("rețeta rămâne pornită după audit", () => {
    runAuditUi({}, deps);
    expect(recipe.textContent).toContain("12px");
  });
});

describe("tăieturile din cutia în care a pus ceva agentul (proba pasului 4, A)", () => {
  it("rândul împins afară de scurtătura agentului e introduced, deși apare și cu rețeta oprită", () => {
    document.body.innerHTML = `
      <section data-t="facturi" style="height: 310px; overflow: hidden">
        <a data-t="scurtatura" data-shape="plata" href="/plata" style="display: block; font-size: 18px">Plătește</a>
        <a data-t="ultimul" href="/d6" style="display: block; font-size: 18px">Descarcă</a>
      </section>
      <div data-t="site" style="height: 40px; overflow: hidden">
        <a data-t="vechi-taiat" href="/v" style="display: block; font-size: 18px">Al site-ului</a>
      </div>`;
    const rects: Record<string, DOMRect> = {
      facturi: new DOMRect(0, 0, 600, 310),
      scurtatura: new DOMRect(0, 0, 200, 56),
      ultimul: new DOMRect(0, 320, 100, 44),
      site: new DOMRect(0, 400, 600, 40),
      "vechi-taiat": new DOMRect(0, 420, 100, 44),
    };
    for (const el of document.querySelectorAll<HTMLElement>("[data-t]")) {
      el.getBoundingClientRect = () => rects[el.getAttribute("data-t")!] ?? new DOMRect(0, 0, 300, 30);
    }
    const result = runAuditUi({}, deps);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const clipped = result.data.issues.filter((issue) => issue.rule === "clipped");
    expect(clipped.map((issue) => [issue.elementId, issue.introduced ?? false])).toEqual([
      ["ultimul", true],
      ["vechi-taiat", false], // tăiat de site, fără nimic de la agent în cutie
    ]);
  });
});

describe("argumentele", () => {
  it("acceptă {}, lipsa lor, { regionId } și moduleId-ul vechi", () => {
    expect(parseAuditArgs(undefined)).toEqual({});
    expect(parseAuditArgs({})).toEqual({});
    expect(parseAuditArgs({ regionId: "r.main" })).toEqual({ regionId: "r.main" });
    expect(parseAuditArgs({ moduleId: "messages" })).toEqual({});
  });

  it("refuză ce nu se potrivește, cu un exemplu pentru model", () => {
    for (const bad of [[], "x", { regionId: 3 }, { regionId: " " }, { altceva: 1 }]) {
      expect(parseAuditArgs(bad)).toBeUndefined();
    }
    expect(runAuditUi({ altceva: 1 }, deps)).toMatchObject({ ok: false, error: { code: "INVALID_ARGS" } });
  });
});
