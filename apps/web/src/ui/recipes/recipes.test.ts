// Motorul de rețete v1 (B5): aplicare validată, revizii, limite, protecția interfeței noastre, salvare, reaplicare,
// „Revino la original”.

import { afterEach, describe, expect, test } from "vitest";
import { DOM_OP_LIMITS, RECIPE_LIMITS } from "@uishapeshifter/contracts";
import { createRecipeEngine, RECIPE_STYLE_ID, selectorsOf } from "./recipe-engine";
import { loadRecipe, recipeKey, type RecipeStorage } from "./recipe-store";

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

afterEach(() => {
  document.getElementById(RECIPE_STYLE_ID)?.remove();
  document.body.innerHTML = "";
});

describe("aplicarea CSS-ului", () => {
  test("append adaugă, replace înlocuiește; fiecare aplicare e o revizie salvată", async () => {
    document.body.innerHTML = `<nav id="shorts">x</nav><aside>y</aside>`;
    const storage = memoryStorage();
    const engine = createRecipeEngine({ host: "video.ro", storage });
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
    const engine = createRecipeEngine({ host: "a.ro", storage: memoryStorage() });
    await engine.load();
    const partial = await engine.applyCss({ css: "a { color: red } b { background: url(x) }", reason: "x" });
    expect(partial.ok && partial.data.dropped.map((d) => d.reason)).toEqual(["url-function"]);
    const nothing = await engine.applyCss({ css: "@import 'x';", reason: "x" });
    expect(nothing.ok ? null : nothing.error.code).toBe("INVALID_ARGS");
    expect(engine.view().revision).toBe(1);
  });

  test("peste maxCssBytes: INVALID_ARGS, rețeta rămâne cum era", async () => {
    const engine = createRecipeEngine({ host: "a.ro", storage: memoryStorage() });
    await engine.load();
    const huge = `a { content: "${"x".repeat(RECIPE_LIMITS.maxCssBytes)}" }`;
    const result = await engine.applyCss({ css: huge, reason: "x" });
    expect(result.ok ? null : result.error.code).toBe("INVALID_ARGS");
    expect(engine.view().revision).toBe(0);
  });

  test("o regulă care ar ascunde interfața noastră e anulată (targets-our-ui) și nu se salvează", async () => {
    const storage = memoryStorage();
    let ourUiVisible = true;
    const engine = createRecipeEngine({ host: "a.ro", storage, isOurUiVisible: () => ourUiVisible });
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
    const first = createRecipeEngine({ host: "a.ro", storage });
    await first.load();
    await first.applyCss({ css: "aside { display: none }", reason: "x" });
    document.getElementById(RECIPE_STYLE_ID)?.remove(); // „reîncărcare”
    const second = createRecipeEngine({ host: "a.ro", storage });
    await second.load();
    expect(style()).toBe("aside { display: none }");
    expect(second.view().revision).toBe(1);
  });

  test("reset golește foaia și stocarea; o rețetă stricată în stocare = rețetă goală", async () => {
    const storage = memoryStorage();
    const engine = createRecipeEngine({ host: "a.ro", storage });
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
    const engine = createRecipeEngine({ host: "a.ro", storage });
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
    const engine = createRecipeEngine({ host: "a.ro", storage });
    await engine.load();
    for (let i = 0; i < RECIPE_LIMITS.maxRevisions + 2; i++) {
      await engine.applyCss({ css: `.r${i} { display: none }`, reason: `r${i}` });
    }
    const result = await engine.revertTo(1);
    expect(result.ok ? null : result.error.code).toBe("INVALID_ARGS");
    expect(engine.view().revision).toBe(RECIPE_LIMITS.maxRevisions + 2);
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
    const engine = createRecipeEngine({ host: "a.ro", storage });
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
    const engine = createRecipeEngine({ host: "test.ro", storage, isOurUiVisible });
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

describe("selectorii din CSS", () => {
  test("liste, @media, fără pseudo-elemente și fără @keyframes", () => {
    const css = `a, b:not(.x, .y) { color: red }
@media (max-width: 600px) { nav > li::before { content: "" } }
@keyframes k { from { opacity: 0 } to { opacity: 1 } }`;
    expect(selectorsOf(css)).toEqual(["a", "b:not(.x, .y)", "nav > li"]);
  });
});
