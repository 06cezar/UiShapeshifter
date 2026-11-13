// Motorul de rețete v1 (B5): aplicare validată, revizii, limite, protecția interfeței noastre, salvare, reaplicare,
// „Revino la original”.

import { afterEach, describe, expect, test } from "vitest";
import { RECIPE_LIMITS } from "@uishapeshifter/contracts";
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

describe("selectorii din CSS", () => {
  test("liste, @media, fără pseudo-elemente și fără @keyframes", () => {
    const css = `a, b:not(.x, .y) { color: red }
@media (max-width: 600px) { nav > li::before { content: "" } }
@keyframes k { from { opacity: 0 } to { opacity: 1 } }`;
    expect(selectorsOf(css)).toEqual(["a", "b:not(.x, .y)", "nav > li"]);
  });
});
