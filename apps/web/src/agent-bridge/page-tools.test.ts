// Cazul apply_ops din executorul uneltelor în pagină (B6): argumentele verificate, motorul real chemat cu runId.

import { afterEach, describe, expect, test } from "vitest";
import type { ApplyOpsData } from "@uishapeshifter/contracts";
import type { PageRegistry } from "../ui/page-registry/registry";
import { createRecipeEngine, type RecipeEngine } from "../ui/recipes/recipe-engine";
import type { RecipeStorage } from "../ui/recipes/recipe-store";
import { runPageTool, type PageToolDeps } from "./page-tools";

function memoryStorage(): RecipeStorage {
  const data: Record<string, unknown> = {};
  return {
    get: async (keys) => Object.fromEntries([keys].flat().map((k) => [k, data[k]])),
    set: async (items) => void Object.assign(data, structuredClone(items)),
    remove: async (keys) => [keys].flat().forEach((k) => delete data[k]),
  };
}

let engine: RecipeEngine | null = null;
afterEach(() => {
  engine?.dispose();
  engine = null;
  document.body.innerHTML = "";
});

async function deps(): Promise<PageToolDeps> {
  document.body.innerHTML = `<main><form role="search">căutare</form><p>text</p></main>`;
  engine = createRecipeEngine({ host: "test.ro", storage: memoryStorage() });
  await engine.load();
  return { registry: {} as PageRegistry, recipes: engine };
}

describe("apply_ops în pagină", () => {
  test("aplică prin motorul de rețete și întoarce ApplyOpsData; runId ajunge în istoric", async () => {
    const d = await deps();
    const result = await runPageTool(
      "apply_ops",
      {
        ops: [{ op: "move", selector: "[role='search']", to: { selector: "body", position: "prepend" } }],
        reason: "căutarea sus",
      },
      d,
      "run-7",
    );
    expect(result).toEqual({ ok: true, data: { revision: 1, applied: 1, skipped: [], htmlDropped: [] } });
    expect(document.body.firstElementChild?.getAttribute("role")).toBe("search");
  });

  test("operațiile din B3 și selectorii greșiți ies în skipped, nu ca eroare", async () => {
    const result = await runPageTool(
      "apply_ops",
      {
        ops: [
          { op: "inject", id: "x" },
          { op: "remove", selector: "#nu" },
        ],
        reason: "x",
      },
      await deps(),
    );
    const data = result.ok ? (result.data as ApplyOpsData) : null;
    expect(data?.skipped.map((s) => s.reason)).toEqual(["INVALID", "SELECTOR_NOT_FOUND"]);
  });

  test.each([
    [{ reason: "x" }],
    [{ ops: "remove .ad", reason: "x" }],
    [{ ops: [] }],
    [{ ops: [{ op: "remove", selector: ".ad" }], reason: "   " }],
    [null],
  ])("argumente greșite → INVALID_ARGS: %j", async (args) => {
    const result = await runPageTool("apply_ops", args, await deps());
    expect(result.ok ? null : result.error.code).toBe("INVALID_ARGS");
  });

  test("fără motor pornit → INTERNAL", async () => {
    const result = await runPageTool(
      "apply_ops",
      { ops: [{ op: "remove", selector: "p" }], reason: "x" },
      { registry: {} as PageRegistry },
    );
    expect(result.ok ? null : result.error.code).toBe("INTERNAL");
  });
});
