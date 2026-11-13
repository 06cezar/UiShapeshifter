// Registrul paginii (B2): selectori stabili, id-uri stabile, zone, ce nu intră în snapshot, limita de elemente.
// happy-dom nu face layout: dăm fiecărui element o mărime, ca „vizibil” să se poată calcula.

import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { SNAPSHOT_LIMITS } from "@uishapeshifter/contracts";
import { runPageTool } from "../../agent-bridge/page-tools";
import { createPageRegistry } from "./registry";
import { buildSelector, looksHumanId } from "./selector";

const HOST = "uishapeshifter-root";

beforeEach(() => {
  vi.spyOn(Element.prototype, "getBoundingClientRect").mockImplementation(function (this: Element) {
    const hidden = getComputedStyle(this).display === "none" || this.closest("[hidden]") !== null;
    // data-h: înălțimea dată de test (happy-dom nu face layout), ca să deosebim un raft de titlul lui
    const h = Number((this as HTMLElement).dataset?.h ?? 20);
    return {
      x: 10,
      y: 10,
      width: hidden ? 0 : 100,
      height: hidden ? 0 : h,
      top: 10,
      left: 10,
      right: 110,
      bottom: 10 + h,
      toJSON() {},
    } as DOMRect;
  });
});
afterEach(() => {
  vi.restoreAllMocks();
  document.body.innerHTML = "";
});

function registry() {
  return createPageRegistry({ ourHostId: HOST, recipe: () => ({ revision: 3, css: "a { color: red }" }) });
}

describe("selectorul", () => {
  test("id scris de om, nu unul generat", () => {
    expect(looksHumanId("search-box")).toBe(true);
    expect(looksHumanId("ember1234")).toBe(false);
    expect(looksHumanId("a8f3k2")).toBe(false);
  });

  test("ordinea: #id → aria-label → href → cale structurală, fără clase", () => {
    document.body.innerHTML = `
      <button id="cauta">Caută</button>
      <button class="css-1x2y3z" aria-label="Meniu">≡</button>
      <nav><a class="sc-abc" href="/shorts/123">Shorts</a></nav>
      <ul><li><span>a</span></li><li><span class="x9">b</span></li></ul>`;
    expect(buildSelector(document.querySelector("#cauta")!)).toBe("#cauta");
    expect(buildSelector(document.querySelector("[aria-label]")!)).toBe('[aria-label="Meniu"]');
    expect(buildSelector(document.querySelector("a")!)).toBe('a[href^="/shorts"]');
    const second = document.querySelectorAll("span")[1]!;
    const structural = buildSelector(second);
    expect(structural).toBe("body > ul > li:nth-of-type(2) > span");
    expect(document.querySelector(structural)).toBe(second);
    expect(structural).not.toContain(".");
  });
});

describe("registrul și snapshot-ul", () => {
  test("zone cu id după rol, elemente cu id stabil, rețeta curentă", () => {
    document.body.innerHTML = `
      <header><a href="/">Acasă</a></header>
      <nav aria-label="Principal"><a href="/a">A</a><a href="/b">B</a></nav>
      <main><h1>Titlu</h1><article><header><h2>Articol</h2></header></article><button>Plătește</button></main>
      <aside><a href="/c">C</a></aside><aside><a href="/d">D</a></aside>`;
    const reg = registry();
    const snap = reg.snapshot();
    expect(snap.regions.map((r) => r.id)).toEqual(["r.header", "r.nav", "r.main", "r.aside", "r.aside-2"]);
    // fiecare zonă are un selector care o găsește exact
    for (const region of snap.regions) expect(document.querySelectorAll(region.selector)).toHaveLength(1);
    expect(snap.regions.find((r) => r.id === "r.nav")!.selector).toBe('[aria-label="Principal"]');
    const pay = snap.elements.find((e) => e.label === "Plătește")!;
    expect(pay).toMatchObject({ role: "button", regionId: "r.main", visible: true, interactive: true });
    expect(reg.snapshot().elements.find((e) => e.label === "Plătește")!.id).toBe(pay.id);
    expect(reg.elementOf(pay.id)).toBe(document.querySelector("main > button"));
    expect(snap.recipe).toEqual({ revision: 3, css: "a { color: red }" });
  });

  test("nu intră: interfața noastră, elementele ascunse de site, valorile câmpurilor", () => {
    document.body.innerHTML = `
      <div id="${HOST}"><button>Al nostru</button></div>
      <button data-agent-id="gen.x">Generat</button>
      <button style="display:none">Ascuns</button>
      <label for="p">Parola</label><input id="p" type="password" value="secret123">`;
    const snap = registry().snapshot();
    const labels = snap.elements.map((e) => e.label);
    expect(labels).toEqual(["Parola"]);
    expect(JSON.stringify(snap)).not.toContain("secret123");
  });

  test("pe o pagină plină, ce a ascuns rețeta intră totuși în rezumat (agentul își verifică munca)", () => {
    document.body.innerHTML =
      Array.from({ length: SNAPSHOT_LIMITS.maxElements + 10 }, (_, i) => `<a href="/p${i}">L${i}</a>`).join("") +
      `<div aria-label="Reclamă" id="ad">x</div>`;
    // happy-dom nu aplică sheet.disabled: simulăm foaia rețetei care ascunde #ad cât timp e pornită
    let recipeOn = true;
    const sheet = {
      set disabled(off: boolean) {
        recipeOn = !off;
      },
    };
    vi.spyOn(Element.prototype, "getBoundingClientRect").mockImplementation(function (this: Element) {
      const size = this.id === "ad" && recipeOn ? 0 : 20;
      return {
        x: 10,
        y: 10,
        width: size,
        height: size,
        top: 10,
        left: 10,
        right: 10,
        bottom: 10,
        toJSON() {},
      } as DOMRect;
    });
    const styleElement = { sheet } as unknown as HTMLStyleElement;
    const reg = createPageRegistry({
      ourHostId: HOST,
      recipe: () => ({ revision: 1, css: "#ad{display:none}", styleElement }),
    });
    const snap = reg.snapshot();
    expect(snap.truncated).toBe(true);
    expect(snap.elements[0]).toMatchObject({ label: "Reclamă", visible: false, hiddenBy: "recipe" });
  });

  test("cel mult maxElements, cu truncated", () => {
    document.body.innerHTML = Array.from(
      { length: SNAPSHOT_LIMITS.maxElements + 15 },
      (_, i) => `<a href="/p${i}">L${i}</a>`,
    ).join("");
    const snap = registry().snapshot();
    expect(snap.elements).toHaveLength(SNAPSHOT_LIMITS.maxElements);
    expect(snap.truncated).toBe(true);
  });
});

describe("blocurile cu titlu (raftul de Shorts, nu doar titlul)", () => {
  test("raftul apare ca grup, cu selectorul care prinde toate rafturile de Shorts", () => {
    document.body.innerHTML = `
      <main>
        <ytd-rich-shelf-renderer is-shorts="" data-h="600">
          <div id="dismissible" data-h="600"><div id="contents" data-h="600">
            <div data-h="40"><h2 data-h="28"><span id="title" data-h="28">Shorts</span></h2></div>
            <a href="/shorts/1">Clip 1</a><a href="/shorts/2">Clip 2</a>
          </div></div>
        </ytd-rich-shelf-renderer>
        <ytd-rich-shelf-renderer data-h="600">
          <div data-h="40"><h2 data-h="28"><span id="title" data-h="28">Recomandate</span></h2></div>
          <a href="/watch?v=1">Video 1</a><a href="/watch?v=2">Video 2</a>
        </ytd-rich-shelf-renderer>
      </main>`;
    const snap = registry().snapshot();
    const shelf = snap.elements.find((e) => e.tag === "ytd-rich-shelf-renderer" && e.label === "Shorts")!;
    expect(shelf).toMatchObject({ role: "group", selector: "ytd-rich-shelf-renderer[is-shorts]" });
    expect(document.querySelectorAll(shelf.selector)).toHaveLength(1);
    const other = snap.elements.find((e) => e.tag === "ytd-rich-shelf-renderer" && e.label === "Recomandate")!;
    expect(other.role).toBe("group");
    expect(document.querySelector(other.selector)?.textContent).toContain("Recomandate");
  });
});

describe("executorul uneltelor în pagină", () => {
  test("get_page_snapshot pe o zonă; zonă inexistentă = ELEMENT_NOT_FOUND; apply_css fără motor = INTERNAL", async () => {
    document.body.innerHTML = `<nav><a href="/a">A</a></nav><main><button>B</button></main>`;
    const deps = { registry: registry() };
    const nav = await runPageTool("get_page_snapshot", { regionId: "r.nav" }, deps);
    expect(nav.ok && nav.data).toMatchObject({ elements: [{ label: "A" }] });
    const missing = await runPageTool("get_page_snapshot", { regionId: "r.nimic" }, deps);
    expect(missing.ok ? null : missing.error.code).toBe("ELEMENT_NOT_FOUND");
    const css = await runPageTool("apply_css", { css: "a{}", reason: "x" }, deps);
    expect(css.ok ? null : css.error.code).toBe("INTERNAL");
    const noAudit = await runPageTool("audit_ui", {}, deps);
    expect(noAudit.ok ? null : noAudit.error.code).toBe("INTERNAL");
    const withAudit = await runPageTool(
      "audit_ui",
      { regionId: "r.main" },
      {
        ...deps,
        audit: (args) => ({ ok: true, data: { echo: args } }),
      },
    );
    expect(withAudit).toEqual({ ok: true, data: { echo: { regionId: "r.main" } } });
    const bad = await runPageTool("apply_css", { css: 1 }, deps);
    expect(bad.ok ? null : bad.error.code).toBe("INVALID_ARGS");
  });
});
