// Motorul de rețete v1 (B5): aplicare validată, revizii, limite, protecția interfeței noastre, salvare, reaplicare,
// „Revino la original”.

import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { DOM_OP_LIMITS, RECIPE_LIMITS } from "@uishapeshifter/contracts";
import {
  createRecipeEngine,
  type RecipeEngine,
  MAX_REPAIRS_PER_WINDOW,
  REAPPLY_DEBOUNCE_MS,
  RECIPE_STYLE_ID,
  REPAIR_WINDOW_MS,
  selectorsOf,
} from "./recipe-engine";
import { loadRecipe, recipeKey, type RecipeStorage } from "./recipe-store";
import { createPageRegistry } from "../page-registry/registry";
import { FADE_MS } from "./fade";

function memoryStorage(): RecipeStorage & { data: Record<string, unknown> } {
  const data: Record<string, unknown> = {};
  return {
    data,
    get: async (keys) => Object.fromEntries([keys].flat().map((k) => [k, data[k]])),
    set: async (items) => void Object.assign(data, structuredClone(items)),
    remove: async (keys) => [keys].flat().forEach((k) => delete data[k]),
  };
}

const style = () => document.getElementById(RECIPE_STYLE_ID)?.textContent ?? null;

const engines: RecipeEngine[] = [];
/** Ca createRecipeEngine, dar motorul e oprit după test (un singur motor pe pagină, ca în extensie). */
function newEngine(options: Parameters<typeof createRecipeEngine>[0]): RecipeEngine {
  const engine = createRecipeEngine(options);
  engines.push(engine);
  return engine;
}

afterEach(() => {
  engines.splice(0).forEach((engine) => engine.dispose());
  document.getElementById(RECIPE_STYLE_ID)?.remove();
  document.body.innerHTML = "";
});

describe("aplicarea CSS-ului", () => {
  test("append adaugă, replace înlocuiește; fiecare aplicare e o revizie salvată", async () => {
    document.body.innerHTML = `<nav id="shorts">x</nav><aside>y</aside>`;
    const storage = memoryStorage();
    const engine = newEngine({ host: "video.ro", storage });
    await engine.load();

    const first = await engine.applyCss({ css: "#shorts { display: none }", reason: "fără Shorts", runId: "r1" });
    expect(first).toMatchObject({ ok: true, data: { revision: 1, dropped: [], unmatchedSelectors: [] } });
    const second = await engine.applyCss({ css: "aside { display: none } .nu-exista { color: red }", reason: "x" });
    expect(second.ok && second.data.unmatchedSelectors).toEqual([".nu-exista"]);
    expect(style()).toContain("#shorts");
    expect(style()).toContain("aside");

    const replaced = await engine.applyCss({ css: "aside { display: none }", mode: "replace", reason: "reparație" });
    expect(replaced.ok && replaced.data.revision).toBe(3);
    expect(style()).not.toContain("#shorts");

    const saved = await loadRecipe(storage, "video.ro", "now");
    expect(saved.recipe.revision).toBe(3);
    expect(saved.revisions.map((r) => r.reason)).toEqual(["fără Shorts", "x", "reparație"]);
    expect(saved.revisions[0]!.runId).toBe("r1");
  });

  test("ce scoate validarea apare în dropped; dacă nu rămâne nimic, INVALID_ARGS și revizia nu crește", async () => {
    const engine = newEngine({ host: "a.ro", storage: memoryStorage() });
    await engine.load();
    const partial = await engine.applyCss({ css: "a { color: red } b { background: url(x) }", reason: "x" });
    expect(partial.ok && partial.data.dropped.map((d) => d.reason)).toEqual(["url-function"]);
    const nothing = await engine.applyCss({ css: "@import 'x';", reason: "x" });
    expect(nothing.ok ? null : nothing.error.code).toBe("INVALID_ARGS");
    expect(engine.view().revision).toBe(1);
  });

  test("peste maxCssBytes: INVALID_ARGS, rețeta rămâne cum era", async () => {
    const engine = newEngine({ host: "a.ro", storage: memoryStorage() });
    await engine.load();
    const huge = `a { content: "${"x".repeat(RECIPE_LIMITS.maxCssBytes)}" }`;
    const result = await engine.applyCss({ css: huge, reason: "x" });
    expect(result.ok ? null : result.error.code).toBe("INVALID_ARGS");
    expect(engine.view().revision).toBe(0);
  });

  test("o regulă care ar ascunde interfața noastră e anulată (targets-our-ui) și nu se salvează", async () => {
    const storage = memoryStorage();
    let ourUiVisible = true;
    const engine = newEngine({ host: "a.ro", storage, isOurUiVisible: () => ourUiVisible });
    await engine.load();
    await engine.applyCss({ css: "aside { display: none }", reason: "ok" });
    ourUiVisible = false; // ca și cum `div { display: none }` ne-ar fi ascuns insigna
    const result = await engine.applyCss({ css: "div { display: none }", reason: "prea larg" });
    expect(result.ok ? null : (result.error.details as { dropped: { reason: string }[] }).dropped.at(-1)?.reason).toBe(
      "targets-our-ui",
    );
    expect(style()).toBe("aside { display: none }");
    expect((await loadRecipe(storage, "a.ro", "now")).recipe.revision).toBe(1);
  });
});

describe("reaplicarea și „Revino la original”", () => {
  test("rețeta salvată se pune în pagină la load, fără server", async () => {
    const storage = memoryStorage();
    const first = newEngine({ host: "a.ro", storage });
    await first.load();
    await first.applyCss({ css: "aside { display: none }", reason: "x" });
    document.getElementById(RECIPE_STYLE_ID)?.remove(); // „reîncărcare”
    const second = newEngine({ host: "a.ro", storage });
    await second.load();
    expect(style()).toBe("aside { display: none }");
    expect(second.view().revision).toBe(1);
  });

  test("reset golește foaia și stocarea; o rețetă stricată în stocare = rețetă goală", async () => {
    const storage = memoryStorage();
    const engine = newEngine({ host: "a.ro", storage });
    await engine.load();
    await engine.applyCss({ css: "aside { display: none }", reason: "x" });
    await engine.reset();
    expect(style()).toBe("");
    expect(storage.data[recipeKey("a.ro")]).toBeUndefined();

    storage.data[recipeKey("a.ro")] = { recipe: "stricat" };
    expect((await loadRecipe(storage, "a.ro", "now")).recipe).toMatchObject({ revision: 0, css: "" });
  });
});

describe("„Anulez”: revertTo", () => {
  async function threeRevisions() {
    const storage = memoryStorage();
    const engine = newEngine({ host: "a.ro", storage });
    await engine.load();
    await engine.applyCss({ css: "aside { display: none }", reason: "unu", runId: "r1" });
    await engine.applyCss({ css: "nav { display: none }", reason: "doi", runId: "r2" });
    await engine.applyCss({ css: "footer { display: none }", reason: "trei", runId: "r2" });
    return { storage, engine };
  }

  test("rețeta devine exact cea de la revizia cerută, reviziile de după se șterg, iar rezultatul se salvează", async () => {
    const { storage, engine } = await threeRevisions();
    expect(await engine.revertTo(1)).toEqual({ ok: true, data: { revision: 1 } });
    expect(style()).toBe("aside { display: none }");
    expect(engine.view().revision).toBe(1);
    const saved = await loadRecipe(storage, "a.ro", "now");
    expect(saved.recipe).toMatchObject({ revision: 1, css: "aside { display: none }" });
    expect(saved.revisions.map((r) => r.reason)).toEqual(["unu"]);

    // după anulare, revizia următoare pornește de la 2 din nou
    const next = await engine.applyCss({ css: "header { display: none }", reason: "patru" });
    expect(next.ok && next.data.revision).toBe(2);
  });

  test("Anulez = revertTo(revizia dinainte de rulare): scoate toate schimbările rulării", async () => {
    const { engine } = await threeRevisions();
    await engine.revertTo(1); // rularea r2 a pornit de la revizia 1
    expect(style()).not.toContain("nav");
    expect(style()).not.toContain("footer");
  });

  test("revertTo(0) dă rețeta goală, salvată", async () => {
    const { storage, engine } = await threeRevisions();
    expect(await engine.revertTo(0)).toEqual({ ok: true, data: { revision: 0 } });
    expect(style()).toBe("");
    const saved = await loadRecipe(storage, "a.ro", "now");
    expect(saved.recipe).toMatchObject({ revision: 0, css: "" });
    expect(saved.revisions).toEqual([]);
  });

  test("o revizie care nu mai e în istoric (sau nu e validă) întoarce INVALID_ARGS și nu schimbă nimic", async () => {
    const { storage, engine } = await threeRevisions();
    const before = structuredClone(storage.data);
    for (const bad of [7, -1, 1.5]) {
      const result = await engine.revertTo(bad);
      expect(result.ok ? null : result.error.code).toBe("INVALID_ARGS");
    }
    const missing = await engine.revertTo(7);
    expect(missing.ok ? "" : missing.error.message).toContain("păstrate: 1, 2, 3");
    expect(engine.view().revision).toBe(3);
    expect(storage.data).toEqual(before);
  });

  test("o revizie aruncată din istoric (peste maxRevisions) nu se mai poate cere", async () => {
    const storage = memoryStorage();
    const engine = newEngine({ host: "a.ro", storage });
    await engine.load();
    for (let i = 0; i < RECIPE_LIMITS.maxRevisions + 2; i++) {
      await engine.applyCss({ css: `.r${i} { display: none }`, reason: `r${i}` });
    }
    const result = await engine.revertTo(1);
    expect(result.ok ? null : result.error.code).toBe("INVALID_ARGS");
    expect(engine.view().revision).toBe(RECIPE_LIMITS.maxRevisions + 2);
  });
});

describe("Anulez pe o singură cerere: undoRequest", () => {
  async function threeRequests() {
    const storage = memoryStorage();
    const engine = newEngine({ host: "a.ro", storage });
    await engine.load();
    await engine.applyCss({ css: "aside { display: none }", reason: "fără coloană", runId: "r1" });
    await engine.applyCss({ css: "nav { display: none }", reason: "fără meniu", runId: "r2" });
    await engine.applyCss({ css: "footer { display: none }", reason: "fără subsol", runId: "r3" });
    return { storage, engine };
  }

  test("scoate doar cererea aleasă; cele de dinainte și de după rămân, iar rezultatul se salvează", async () => {
    const { storage, engine } = await threeRequests();
    const result = await engine.undoRequest("r2");
    expect(result).toEqual({ ok: true, revision: 4, droppedOps: 0 });
    expect(style()).toContain("aside");
    expect(style()).toContain("footer");
    expect(style()).not.toContain("nav");
    const saved = await loadRecipe(storage, "a.ro", "now");
    expect(saved.recipe.css).not.toContain("nav");
  });

  test("lista arată doar cererile care mai au efect; a doua anulare nu o readuce pe prima", async () => {
    const { engine } = await threeRequests();
    await engine.undoRequest("r2");
    expect(engine.history().map((entry) => entry.reason)).toEqual(["fără coloană", "fără subsol"]);
    await engine.undoRequest("r1");
    expect(style()).not.toContain("nav");
    expect(style()).not.toContain("aside");
    expect(style()).toContain("footer");
    expect(engine.history().map((entry) => entry.reason)).toEqual(["fără subsol"]);
  });

  test("Anulez al rulării (revertTo) merge și după o anulare de cerere", async () => {
    const { engine } = await threeRequests();
    await engine.undoRequest("r2");
    await engine.revertTo(3);
    expect(style()).toContain("nav");
  });

  test("o cerere necunoscută nu schimbă nimic", async () => {
    const { engine } = await threeRequests();
    expect((await engine.undoRequest("nu-exista")).ok).toBe(false);
    expect(engine.view().revision).toBe(3);
  });
});

describe("ops în stocare", () => {
  const ops = [{ op: "remove", target: { selector: "#banner" } }];

  test("parseStoredRecipe păstrează ops (listă) pe rețetă și pe revizii", async () => {
    const storage = memoryStorage();
    storage.data[recipeKey("a.ro")] = {
      recipe: { host: "a.ro", revision: 1, css: "", ops, updatedAt: "t" },
      revisions: [{ revision: 1, css: "", ops, reason: "x", at: "t" }],
    };
    const saved = await loadRecipe(storage, "a.ro", "now");
    expect(saved.recipe.ops).toEqual(ops);
    expect(saved.revisions[0]!.ops).toEqual(ops);
  });

  test("rețetele din etapa 1 (fără ops) rămân neschimbate; ops care nu e listă se ignoră", async () => {
    const storage = memoryStorage();
    storage.data[recipeKey("a.ro")] = {
      recipe: { host: "a.ro", revision: 1, css: "a { color: red }", ops: "stricat", updatedAt: "t" },
      revisions: [
        { revision: 1, css: "a { color: red }", reason: "x", at: "t" },
        { revision: 2, css: "", ops: { nu: "listă" }, reason: "y", at: "t" },
      ],
    };
    const saved = await loadRecipe(storage, "a.ro", "now");
    expect(saved.recipe).toEqual({ host: "a.ro", revision: 1, css: "a { color: red }", updatedAt: "t" });
    expect(saved.revisions).toEqual([
      { revision: 1, css: "a { color: red }", reason: "x", at: "t" },
      { revision: 2, css: "", reason: "y", at: "t" },
    ]);
  });

  test("revertTo duce și ops-urile reviziei cerute", async () => {
    const storage = memoryStorage();
    storage.data[recipeKey("a.ro")] = {
      recipe: { host: "a.ro", revision: 2, css: "", updatedAt: "t" },
      revisions: [
        { revision: 1, css: "", ops, reason: "x", at: "t" },
        { revision: 2, css: "", reason: "y", at: "t" },
      ],
    };
    const engine = newEngine({ host: "a.ro", storage });
    await engine.load();
    await engine.revertTo(1);
    expect((await loadRecipe(storage, "a.ro", "now")).recipe.ops).toEqual(ops);
  });
});

describe("operațiile de structură în motor (B6)", () => {
  const PAGE =
    '<main id="main"><form role="search">căutare</form><div class="ad">R1</div><div class="ad">R2</div><p id="t">Titlu</p></main>';
  const moveSearch = {
    op: "move",
    selector: "[role='search']",
    to: { selector: "body", position: "prepend" },
  } as const;
  const hideAds = { op: "remove", selector: ".ad" } as const;

  async function engineOn(html = PAGE, storage = memoryStorage(), isOurUiVisible?: () => boolean) {
    document.body.innerHTML = html;
    const engine = newEngine({ host: "test.ro", storage, isOurUiVisible });
    await engine.load();
    return { engine, storage };
  }

  test("applyOps aplică, creează o revizie cu lista completă și o salvează", async () => {
    const { engine, storage } = await engineOn();
    const result = await engine.applyOps({ ops: [moveSearch], reason: "căutarea sus", runId: "r1" });
    expect(result).toEqual({ ok: true, data: { revision: 1, applied: 1, skipped: [], htmlDropped: [] } });
    expect(document.body.firstElementChild?.getAttribute("role")).toBe("search");

    const second = await engine.applyOps({ ops: [hideAds], reason: "fără reclame" });
    expect(second.ok && second.data.revision).toBe(2);
    const saved = await loadRecipe(storage, "test.ro", "now");
    expect(saved.recipe.ops).toEqual([moveSearch, hideAds]);
    expect(saved.revisions.map((r) => r.ops?.length)).toEqual([1, 2]);
    expect(saved.revisions[0]!.runId).toBe("r1");
  });

  test("în rețetă intră doar operațiile aplicate; skipped are pozițiile din apel, sortate", async () => {
    const { engine, storage } = await engineOn();
    const result = await engine.applyOps({
      ops: [
        { op: "remove", selector: "#nu-exista" },
        hideAds,
        { op: "insertHtml" },
        { op: "setText", selector: "#main", text: "x" },
      ],
      reason: "amestec",
    });
    expect(result.ok && result.data.applied).toBe(1);
    expect(result.ok && result.data.skipped.map((s) => [s.index, s.reason])).toEqual([
      [0, "SELECTOR_NOT_FOUND"],
      [2, "INVALID"],
      [3, "INVALID"],
    ]);
    expect((await loadRecipe(storage, "test.ro", "now")).recipe.ops).toEqual([hideAds]);
  });

  test("dacă nu se aplică nimic: ok, applied 0, revizia neschimbată, nimic salvat", async () => {
    const { engine, storage } = await engineOn();
    const result = await engine.applyOps({ ops: [{ op: "remove", selector: "#nu" }], reason: "x" });
    expect(result).toMatchObject({ ok: true, data: { revision: 0, applied: 0 } });
    expect(storage.data[recipeKey("test.ro")]).toBeUndefined();
  });

  test("aceeași operație a doua oară: ALREADY_APPLIED, fără dublură", async () => {
    const { engine } = await engineOn();
    await engine.applyOps({ ops: [moveSearch], reason: "x" });
    const again = await engine.applyOps({ ops: [moveSearch], reason: "x" });
    expect(again.ok && again.data.skipped[0]!.reason).toBe("ALREADY_APPLIED");
    expect(engine.view().revision).toBe(1);
  });

  test("limitele: prea multe pe apel sau în rețetă → INVALID_ARGS, nimic schimbat", async () => {
    const { engine } = await engineOn();
    const tooMany = Array.from({ length: DOM_OP_LIMITS.maxOpsPerCall + 1 }, () => hideAds);
    expect((await engine.applyOps({ ops: tooMany, reason: "x" })).ok).toBe(false);
    expect((await engine.applyOps({ ops: [], reason: "x" })).ok).toBe(false);

    const storage = memoryStorage();
    const full = Array.from({ length: DOM_OP_LIMITS.maxOpsPerRecipe }, (_, i) => ({
      op: "setAttr",
      selector: "#t",
      name: "title",
      value: String(i),
    }));
    storage.data[recipeKey("test.ro")] = {
      recipe: { host: "test.ro", revision: 1, css: "", ops: full, updatedAt: "t" },
      revisions: [],
    };
    const { engine: fullEngine } = await engineOn(PAGE, storage);
    const result = await fullEngine.applyOps({ ops: [hideAds], reason: "x" });
    expect(result.ok ? null : result.error.code).toBe("INVALID_ARGS");
    expect(fullEngine.view().revision).toBe(1);
  });

  test("dacă schimbarea ascunde interfața noastră, e anulată și nu se salvează", async () => {
    let visible = true;
    const { engine, storage } = await engineOn(PAGE, memoryStorage(), () => visible);
    const before = document.body.innerHTML;
    visible = false;
    const result = await engine.applyOps({ ops: [hideAds], reason: "x" });
    expect(result.ok ? null : result.error.code).toBe("INVALID_ARGS");
    expect(document.body.innerHTML).toBe(before);
    expect(storage.data[recipeKey("test.ro")]).toBeUndefined();
  });

  test("load pe o pagină nouă reaplică operațiile salvate, fără server", async () => {
    const storage = memoryStorage();
    const { engine } = await engineOn(PAGE, storage);
    await engine.applyOps({ ops: [moveSearch, hideAds], reason: "x" });
    const { engine: reloaded } = await engineOn(PAGE, storage); // „reîncărcare”: pagina ca la început, motor nou
    expect(document.body.firstElementChild?.getAttribute("role")).toBe("search");
    expect(document.querySelectorAll(".ad[data-uishapeshifter-hidden]")).toHaveLength(2);
    expect(reloaded.view().revision).toBe(1);
  });

  test("revertTo scoate exact ultima schimbare de structură; revertTo(0) și reset aduc pagina la original", async () => {
    const { engine } = await engineOn();
    const original = document.body.innerHTML;
    await engine.applyOps({ ops: [moveSearch], reason: "unu" });
    const afterFirst = document.body.innerHTML;
    await engine.applyOps({ ops: [hideAds], reason: "doi" });
    await engine.revertTo(1);
    expect(document.body.innerHTML).toBe(afterFirst);
    await engine.revertTo(0);
    expect(document.body.innerHTML).toBe(original);

    await engine.applyOps({ ops: [moveSearch, hideAds], reason: "trei" });
    await engine.reset();
    expect(document.body.innerHTML).toBe(original);
  });

  test("applyCss nu pierde operațiile; Anulez după CSS păstrează structura", async () => {
    const { engine, storage } = await engineOn();
    await engine.applyOps({ ops: [hideAds], reason: "ops" });
    await engine.applyCss({ css: "#t { color: red }", reason: "css" });
    expect((await loadRecipe(storage, "test.ro", "now")).recipe.ops).toEqual([hideAds]);
    await engine.revertTo(1);
    expect(style()).toBe("");
    expect(document.querySelectorAll(".ad[data-uishapeshifter-hidden]")).toHaveLength(2);
  });

  test("adopt (alt tab sau popup-ul) aduce pagina la rețeta primită", async () => {
    const { engine } = await engineOn();
    const original = document.body.innerHTML;
    engine.adopt({
      recipe: { host: "test.ro", revision: 3, css: "", ops: [moveSearch], updatedAt: "t" },
      revisions: [],
    });
    expect(document.body.firstElementChild?.getAttribute("role")).toBe("search");
    engine.adopt({ recipe: { host: "test.ro", revision: 0, css: "", updatedAt: "t" }, revisions: [] });
    expect(document.body.innerHTML).toBe(original);
  });
});

describe("reaplicarea când pagina se schimbă singură (B6)", () => {
  const moveSearch = {
    op: "move",
    selector: "[role='search']",
    to: { selector: "body", position: "prepend" },
  } as const;

  beforeEach(() => vi.useFakeTimers());
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  /** Site-ul își randează din nou căutarea: scoate nodul vechi și pune unul nou în locul inițial. */
  function rerenderSearch() {
    document.querySelector("[role='search']")?.remove();
    document.getElementById("main")!.insertAdjacentHTML("afterbegin", '<form role="search">nouă</form>');
  }

  async function engineWithSearchMoved() {
    document.body.innerHTML = '<main id="main"><form role="search">căutare</form><p>conținut</p></main>';
    const engine = newEngine({ host: "test.ro", storage: memoryStorage() });
    await engine.load();
    await engine.applyOps({ ops: [moveSearch], reason: "sus" });
    return engine;
  }

  const searchOnTop = () => document.body.firstElementChild?.getAttribute("role") === "search";

  test("site-ul își randează din nou căutarea: după debounce e mutată iar, fără marcaje rămase", async () => {
    await engineWithSearchMoved();
    rerenderSearch();
    expect(searchOnTop()).toBe(false);
    await vi.advanceTimersByTimeAsync(REAPPLY_DEBOUNCE_MS);
    expect(searchOnTop()).toBe(true);
    expect(document.body.firstElementChild?.textContent).toBe("nouă");
    expect(document.querySelectorAll("[role='search']")).toHaveLength(1);
    expect(document.body.innerHTML.match(/uishapeshifter:marcaj/g)).toHaveLength(1);
  });

  test("reaplicarea pune doar ce lipsește, nu anulează tot: o operație intactă nu e atinsă", async () => {
    const engine = await engineWithSearchMoved();
    await engine.applyOps({ ops: [{ op: "setAttr", selector: "p", name: "title", value: "t" }], reason: "x" });
    const paragraph = document.querySelector("p")!;
    paragraph.setAttribute("title", "stricat de site");
    const search = document.querySelector("[role='search']");
    await vi.advanceTimersByTimeAsync(REAPPLY_DEBOUNCE_MS);
    expect(paragraph.getAttribute("title")).toBe("t");
    expect(document.querySelector("[role='search']")).toBe(search); // mutarea intactă n-a fost refăcută
  });

  test("un element care nu există încă (ex. căutarea pe plata.html) se reîncearcă la fiecare schimbare, fără să consume limita", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const storage = memoryStorage();
    storage.data[recipeKey("test.ro")] = {
      recipe: { host: "test.ro", revision: 1, css: "", ops: [moveSearch], updatedAt: "t" },
      revisions: [],
    };
    document.body.innerHTML = '<main id="main"><p>plata</p></main>';
    const engine = newEngine({ host: "test.ro", storage });
    await engine.load();
    for (let i = 0; i < MAX_REPAIRS_PER_WINDOW * 3; i++) {
      document.getElementById("main")!.insertAdjacentHTML("beforeend", "<span>x</span>");
      await vi.advanceTimersByTimeAsync(REAPPLY_DEBOUNCE_MS);
    }
    expect(warn).not.toHaveBeenCalled();
    // elementul apare în sfârșit: se aplică, iar refacerile au încă toată limita
    document.getElementById("main")!.insertAdjacentHTML("afterbegin", '<form role="search">apare</form>');
    await vi.advanceTimersByTimeAsync(REAPPLY_DEBOUNCE_MS);
    expect(searchOnTop()).toBe(true);
    for (let i = 0; i < MAX_REPAIRS_PER_WINDOW; i++) {
      rerenderSearch();
      await vi.advanceTimersByTimeAsync(REAPPLY_DEBOUNCE_MS);
      expect(searchOnTop()).toBe(true);
    }
    expect(warn).not.toHaveBeenCalled();
  });

  test("un site care se „luptă” cu motorul: după MAX_REPAIRS_PER_WINDOW refaceri ne oprim, cu un singur avertisment", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    await engineWithSearchMoved();
    let repairs = 0;
    for (let i = 0; i < MAX_REPAIRS_PER_WINDOW + 5; i++) {
      rerenderSearch();
      await vi.advanceTimersByTimeAsync(REAPPLY_DEBOUNCE_MS);
      if (searchOnTop()) repairs++;
    }
    expect(repairs).toBe(MAX_REPAIRS_PER_WINDOW);
    expect(searchOnTop()).toBe(false);
    expect(warn).toHaveBeenCalledTimes(1);
  });

  test("după fereastra anti-buclă, refacerile pornesc din nou", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    await engineWithSearchMoved();
    for (let i = 0; i < MAX_REPAIRS_PER_WINDOW + 1; i++) {
      rerenderSearch();
      await vi.advanceTimersByTimeAsync(REAPPLY_DEBOUNCE_MS);
    }
    expect(searchOnTop()).toBe(false);
    await vi.advanceTimersByTimeAsync(REPAIR_WINDOW_MS);
    rerenderSearch();
    await vi.advanceTimersByTimeAsync(REAPPLY_DEBOUNCE_MS);
    expect(searchOnTop()).toBe(true);
  });

  test("o schimbare a rețetei (revertTo) pornește o fereastră nouă", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const engine = await engineWithSearchMoved();
    for (let i = 0; i < MAX_REPAIRS_PER_WINDOW + 1; i++) {
      rerenderSearch();
      await vi.advanceTimersByTimeAsync(REAPPLY_DEBOUNCE_MS);
    }
    await engine.revertTo(1); // sincronizare completă
    expect(searchOnTop()).toBe(true);
    rerenderSearch();
    await vi.advanceTimersByTimeAsync(REAPPLY_DEBOUNCE_MS);
    expect(searchOnTop()).toBe(true);
  });

  test("schimbările făcute de motor nu pornesc reaplicarea (fără buclă cu noi înșine)", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    await engineWithSearchMoved();
    const before = document.body.innerHTML;
    await vi.advanceTimersByTimeAsync(REAPPLY_DEBOUNCE_MS * 20);
    expect(document.body.innerHTML).toBe(before);
    expect(warn).not.toHaveBeenCalled();
  });
});

describe("pauza rețetei (auditul „cum era înainte de agent”)", () => {
  test("pause oprește foaia, funcția întoarsă o repornește", async () => {
    const engine = newEngine({ host: "a.ro", storage: memoryStorage() });
    await engine.load();
    await engine.applyCss({ css: "aside { display: none }", reason: "x" });
    const sheet = (document.getElementById(RECIPE_STYLE_ID) as HTMLStyleElement).sheet!;
    const resume = engine.pause();
    expect(sheet.disabled).toBe(true);
    resume();
    expect(sheet.disabled).toBe(false);
  });
});

describe("selectorii din CSS", () => {
  test("liste, @media, fără pseudo-elemente și fără @keyframes", () => {
    const css = `a, b:not(.x, .y) { color: red }
@media (max-width: 600px) { nav > li::before { content: "" } }
@keyframes k { from { opacity: 0 } to { opacity: 1 } }`;
    expect(selectorsOf(css)).toEqual(["a", "b:not(.x, .y)", "nav > li"]);
  });
});

describe("urma vizuală a ce ascunde agentul (specs/00, „Cât mai seamless”; condiția lui D)", () => {
  const BOX = () => new DOMRect(10, 20, 300, 60);
  function pageWithAd() {
    document.body.innerHTML = `<main><p id="text">Conținut</p><div id="ad" class="ad">Reclamă</div></main>`;
    for (const el of document.querySelectorAll<HTMLElement>("*")) el.getBoundingClientRect = BOX;
  }
  const ghosts = () => document.querySelectorAll('[data-agent-id="fade"]');

  test("elementul e ascuns din prima clipă, iar urma care se stinge nu e a site-ului", async () => {
    vi.useFakeTimers();
    pageWithAd();
    const engine = newEngine({ host: "a.ro", storage: memoryStorage() });
    await engine.load();
    const result = await engine.applyOps({
      ops: [{ op: "remove", selector: "#ad" }],
      reason: "fără reclame",
      runId: "r1",
    });
    expect(result.ok && result.data.applied).toBe(1);
    expect(getComputedStyle(document.getElementById("ad")!).display).toBe("none");

    // urma e a noastră: snapshot-ul n-o vede ca element vizibil al site-ului și nu poartă id-ul lui
    // (că elementul ascuns apare cu hiddenBy: "recipe" verifică page-registry.test.ts, cu foaia simulată)
    expect(ghosts()).toHaveLength(1);
    const registry = createPageRegistry({ ourHostId: "uishapeshifter-root", recipe: () => engine.view() });
    const visibleAds = registry.snapshot().elements.filter((element) => element.label === "Reclamă" && element.visible);
    expect(visibleAds).toHaveLength(0);
    expect(document.querySelectorAll("#ad")).toHaveLength(1);

    vi.advanceTimersByTime(FADE_MS + 100);
    expect(ghosts()).toHaveLength(0);
    vi.useRealTimers();
  });

  test("selectorii agentului nu prind urma: aceeași operație încă o dată nu e ambiguă", async () => {
    pageWithAd();
    const engine = newEngine({ host: "a.ro", storage: memoryStorage() });
    await engine.load();
    await engine.applyOps({ ops: [{ op: "remove", selector: ".ad" }], reason: "fără reclame", runId: "r1" });
    expect(ghosts()).toHaveLength(1);
    const again = await engine.applyOps({
      ops: [{ op: "setText", selector: ".ad", text: "x" }],
      reason: "test",
      runId: "r2",
    });
    expect(again.ok && again.data.skipped.map((skip) => skip.reason)).not.toContain("SELECTOR_AMBIGUOUS");
  });

  test("cu mișcare redusă (preferințele de bază), fără urmă", async () => {
    pageWithAd();
    const reduced = document.createElement("style");
    reduced.id = "uishapeshifter-base";
    document.head.append(reduced);
    const engine = newEngine({ host: "a.ro", storage: memoryStorage() });
    await engine.load();
    await engine.applyOps({ ops: [{ op: "remove", selector: "#ad" }], reason: "fără reclame", runId: "r1" });
    expect(getComputedStyle(document.getElementById("ad")!).display).toBe("none");
    expect(ghosts()).toHaveLength(0);
  });

  test("la încărcare, rețeta salvată ascunde fără urmă", async () => {
    pageWithAd();
    const storage = memoryStorage();
    const first = newEngine({ host: "a.ro", storage });
    await first.load();
    await first.applyOps({ ops: [{ op: "remove", selector: "#ad" }], reason: "fără reclame", runId: "r1" });
    first.dispose();
    pageWithAd();
    const second = newEngine({ host: "a.ro", storage });
    await second.load();
    expect(getComputedStyle(document.getElementById("ad")!).display).toBe("none");
    expect(ghosts()).toHaveLength(0);
  });
});
