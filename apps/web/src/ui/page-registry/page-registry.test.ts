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

  test("respinge id-urile generate de framework-uri (altele la fiecare încărcare)", () => {
    const generated = [
      "mount_0_0_R4",
      "mount_0_0_Rab",
      ":r1:",
      ":R2a6:",
      "«r1»",
      "_R_1_",
      "x_1_R3k",
      "ember123",
      "ember7",
      "react-select-2-input",
      "react-aria-5",
      "radix-:r3:",
      "headlessui-menu-button-1",
      "__next",
      "__nuxt",
      "C_1AACF49",
      "slideexp0_AAAE3E",
      "slideexp0_AAAE3Echevrons_nextbtn",
    ];
    for (const id of generated) expect(looksHumanId(id), id).toBe(false);
  });

  test("păstrează id-urile obișnuite", () => {
    const human = [
      "search",
      "main-content",
      "p-lang-btn",
      "searchform",
      "b_header",
      "rhs",
      "nav_Right",
      "member",
      "b_context",
      "sb_form_q",
      "ACCEPT",
      "BADGE",
    ];
    for (const id of human) expect(looksHumanId(id), id).toBe(true);
  });

  test("buildSelector nu folosește #mount_0_0_R4, ci un atribut stabil", () => {
    document.body.innerHTML = `<div id="mount_0_0_R4" aria-label="Profil">x</div>`;
    expect(buildSelector(document.querySelector("div")!)).toBe('[aria-label="Profil"]');
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

  test("nu intră: interfața noastră și valorile câmpurilor; blocurile ascunse de site fără buton", () => {
    document.body.innerHTML = `
      <div id="${HOST}"><button>Al nostru</button></div>
      <button data-agent-id="gen.x">Generat</button>
      <section aria-label="Bloc ascuns" style="display:none">x</section>
      <label for="p">Parola</label><input id="p" type="password" value="secret123">`;
    const snap = registry().snapshot();
    const labels = snap.elements.map((e) => e.label);
    expect(labels).toEqual(["Parola"]);
    expect(JSON.stringify(snap)).not.toContain("secret123");
  });

  test("butoanele ascunse de site (meniul ⋯ închis) intră, cu hiddenBy site, ca agentul să le poată folosi", () => {
    document.body.innerHTML = `
      <button>Vizibil</button>
      <details><summary aria-label="Mai multe acțiuni">⋯</summary>
        <a href="/plata" id="plata" style="display:none">Plătește factura</a></details>`;
    const snap = registry().snapshot();
    const pay = snap.elements.find((e) => e.label === "Plătește factura");
    expect(pay).toMatchObject({ visible: false, hiddenBy: "site", selector: "#plata" });
  });

  test("ascunsele de site au locuri rezervate (cel mult 15), chiar pe o pagină plină", () => {
    document.body.innerHTML =
      Array.from({ length: SNAPSHOT_LIMITS.maxElements + 20 }, (_, i) => `<a href="/v${i}">V${i}</a>`).join("") +
      Array.from({ length: 30 }, (_, i) => `<button style="display:none">Ascuns ${i}</button>`).join("");
    const snap = registry().snapshot();
    expect(snap.elements).toHaveLength(SNAPSHOT_LIMITS.maxElements);
    expect(snap.elements.filter((e) => e.hiddenBy === "site")).toHaveLength(15);
    expect(snap.truncated).toBe(true);
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

/** Layout din atribute (data-x/y/w/h), ca să putem pune coloane una lângă alta; happy-dom nu face layout. */
function layoutFromData() {
  vi.spyOn(Element.prototype, "getBoundingClientRect").mockImplementation(function (this: Element) {
    const data = (this as HTMLElement).dataset ?? {};
    const hidden = getComputedStyle(this).display === "none";
    const [x, y, width, height] = [data.x ?? 10, data.y ?? 10, data.w ?? 100, data.h ?? 20].map(Number) as [
      number,
      number,
      number,
      number,
    ];
    const w = hidden ? 0 : width;
    const h = hidden ? 0 : height;
    return { x, y, width: w, height: h, top: y, left: x, right: x + w, bottom: y + h, toJSON() {} } as DOMRect;
  });
}

describe("coloanele unei pagini de rezultate (ca la Bing)", () => {
  const BING_LIKE = `
    <main aria-label="Rezultate" style="display:inline" data-x="0" data-y="3600" data-w="1000" data-h="16">
      <div id="mcw" data-x="0" data-y="100" data-w="1000" data-h="2000">
        <ol id="b_results" data-x="0" data-y="100" data-w="600" data-h="2000">
          <li><h2><a href="https://exemplu.test/a">Rezultatul A</a></h2></li>
        </ol>
        <aside aria-label="Mai multe" style="display:inline" data-x="650" data-y="3600" data-w="300" data-h="16">
          <ol id="b_context" data-x="650" data-y="100" data-w="300" data-h="400">
            <li><a href="https://exemplu.test/b">Căutări asemănătoare</a></li>
          </ol>
        </aside>
      </div>
    </main>`;

  test("o zonă cu display inline primește dreptunghiul copiilor ei, nu linia de 16px", () => {
    layoutFromData();
    document.body.innerHTML = BING_LIKE;
    const snap = registry().snapshot();
    const main = snap.regions.find((r) => r.role === "main");
    const aside = snap.regions.find((r) => r.role === "complementary");
    expect(main?.rect).toEqual({ x: 0, y: 100, width: 1000, height: 2000 });
    expect(aside?.rect).toEqual({ x: 650, y: 100, width: 300, height: 400 });
  });

  test("coloanele puse una lângă alta din conținutul principal devin zone (#b_results)", () => {
    layoutFromData();
    document.body.innerHTML = BING_LIKE;
    const snap = registry().snapshot();
    const results = snap.regions.find((r) => r.selector === "#b_results");
    expect(results).toMatchObject({ role: "region", rect: { x: 0, y: 100, width: 600, height: 2000 } });
    // coloana din dreapta e deja zonă (aside), nu se dublează
    expect(snap.regions.filter((r) => r.role === "complementary")).toHaveLength(1);
    const link = snap.elements.find((e) => e.label === "Rezultatul A");
    expect(link?.regionId).toBe(results?.id);
  });
});

describe("listele care se repetă nu umplu singure rezumatul", () => {
  test("dintr-un carusel lung intră primii, iar rezultatele de sub el intră toate", () => {
    const slides = Array.from(
      { length: 100 },
      (_, i) => `<div class="slide"><a href="/reteta/${i}">Rețeta ${i}</a></div>`,
    ).join("");
    const results = Array.from(
      { length: 10 },
      (_, i) => `<li class="algo"><h2><a href="https://exemplu.test/${i}">Rezultat ${i}</a></h2></li>`,
    ).join("");
    document.body.innerHTML = `<div id="carusel">${slides}</div><ol id="rezultate">${results}</ol>`;
    const snap = registry().snapshot();
    expect(snap.elements).toHaveLength(SNAPSHOT_LIMITS.maxElements);
    expect(snap.truncated).toBe(true);
    const resultLinks = snap.elements.filter((e) => e.role === "link" && e.label.startsWith("Rezultat"));
    expect(resultLinks).toHaveLength(10);
    // primele 3 din carusel au locul lor înaintea celorlalte
    expect(snap.elements.slice(0, 3).map((e) => e.label)).toEqual(["Rețeta 0", "Rețeta 1", "Rețeta 2"]);
  });
});

describe("fundalurile mari decorative (imaginea de pe pagina de start Bing)", () => {
  test("un fundal care acoperă mare parte din ecran intră în rezumat, chiar pe o pagină plină", () => {
    layoutFromData();
    const links = Array.from(
      { length: SNAPSHOT_LIMITS.maxElements + 20 },
      (_, i) => `<a href="/p${i}" class="l${i}">L${i}</a>`,
    ).join("");
    document.body.innerHTML = `
      <div id="hp_top_cover" style="background-image: url(fundal.jpg)" data-x="0" data-y="0" data-w="1024" data-h="700"></div>
      <div id="mic" style="background-image: url(icon.png)" data-x="0" data-y="0" data-w="40" data-h="40"></div>
      ${links}`;
    const snap = registry().snapshot();
    expect(snap.elements).toHaveLength(SNAPSHOT_LIMITS.maxElements);
    const backgrounds = snap.elements.filter((e) => e.label === "Imagine de fundal");
    expect(backgrounds.map((e) => e.selector)).toEqual(["#hp_top_cover"]);
    expect(backgrounds[0]).toMatchObject({ role: "img", visible: true, interactive: false });
  });
});

describe("coloanele rămân zone după ce rețeta ascunde vecina", () => {
  test("#b_results rămâne zonă după ce coloana din dreapta dispare", () => {
    layoutFromData();
    document.body.innerHTML = `
      <main aria-label="Rezultate" data-x="0" data-y="100" data-w="1000" data-h="2000">
        <div id="mcw" data-x="0" data-y="100" data-w="1000" data-h="2000">
          <ol id="b_results" data-x="0" data-y="100" data-w="600" data-h="2000"><li><a href="/a">A</a></li></ol>
          <aside aria-label="Mai multe" data-x="650" data-y="100" data-w="300" data-h="400"><a href="/b">B</a></aside>
        </div>
      </main>`;
    const reg = registry();
    expect(reg.snapshot().regions.some((r) => r.selector === "#b_results")).toBe(true);
    document.querySelector("aside")!.setAttribute("style", "display:none");
    expect(reg.snapshot().regions.some((r) => r.selector === "#b_results")).toBe(true);
  });
});
