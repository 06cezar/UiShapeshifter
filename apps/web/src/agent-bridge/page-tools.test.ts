// Executorul uneltelor în pagină: point_at cu mascota (D2) și apply_ops cu motorul de rețete (B6).

import { afterEach, describe, expect, test, vi } from "vitest";
import type { ApplyOpsData } from "@uishapeshifter/contracts";
import type { PageRegistry } from "../ui/page-registry/registry";
import { createRecipeEngine, type RecipeEngine } from "../ui/recipes/recipe-engine";
import type { RecipeStorage } from "../ui/recipes/recipe-store";
import { runPageTool, type PageToolDeps } from "./page-tools";

function pointDeps(elements: Record<string, Element>, pointAt?: PageToolDeps["pointAt"]): PageToolDeps {
  const registry = {
    idOf: () => "e.0",
    elementOf: (id: string) => elements[id],
    snapshot: () => {
      throw new Error("nefolosit aici");
    },
  } as unknown as PageRegistry;
  return { registry, pointAt };
}

describe("point_at", () => {
  test("fără elementId sau message: INVALID_ARGS", async () => {
    const result = await runPageTool("point_at", { elementId: "e.1" }, pointDeps({}));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("INVALID_ARGS");
  });

  test("un id care nu mai e în pagină: ELEMENT_NOT_FOUND, mascota nu pleacă", async () => {
    const pointAt = vi.fn();
    const result = await runPageTool("point_at", { elementId: "e.9", message: "Aici." }, pointDeps({}, pointAt));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("ELEMENT_NOT_FOUND");
    expect(pointAt).not.toHaveBeenCalled();
  });

  test("fără mascotă montată: INTERNAL", async () => {
    const button = document.createElement("button");
    const result = await runPageTool("point_at", { elementId: "e.1", message: "Aici." }, pointDeps({ "e.1": button }));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("INTERNAL");
  });

  test("elementul găsit ajunge la mascotă, iar rezultatul ei se întoarce agentului", async () => {
    const button = document.createElement("button");
    const rect = { x: 1, y: 2, width: 3, height: 4 };
    const pointAt = vi.fn(async () => ({ ok: true as const, data: { scrolledIntoView: false, rect } }));

    const result = await runPageTool(
      "point_at",
      { elementId: "e.1", message: "Apasă aici." },
      pointDeps({ "e.1": button }, pointAt),
    );

    expect(pointAt).toHaveBeenCalledWith(button, "Apasă aici.");
    expect(result).toEqual({ ok: true, data: { scrolledIntoView: false, rect } });
  });
});

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

async function opsDeps(): Promise<PageToolDeps> {
  document.body.innerHTML = `<main><form role="search">căutare</form><p>text</p></main>`;
  engine = createRecipeEngine({ host: "test.ro", storage: memoryStorage() });
  await engine.load();
  return { registry: {} as PageRegistry, recipes: engine };
}

describe("apply_ops în pagină", () => {
  test("aplică prin motorul de rețete și întoarce ApplyOpsData; runId ajunge în istoric", async () => {
    const d = await opsDeps();
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
      await opsDeps(),
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
    const result = await runPageTool("apply_ops", args, await opsDeps());
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

describe("wait_for_user_click: ghidajul „arată-mi cum…”", () => {
  afterEach(() => {
    vi.useRealTimers();
    document.body.innerHTML = "";
  });

  function clickDeps(): { deps: PageToolDeps; pay: HTMLElement; other: HTMLElement; ours: HTMLElement } {
    document.body.innerHTML = `<button id="pay"><span>Plătește</span></button><a id="other" href="#">Altceva</a>
      <div id="uishapeshifter-root"><button id="panel">Păstrez</button></div>`;
    const pay = document.getElementById("pay")!;
    const other = document.getElementById("other")!;
    const ours = document.getElementById("panel")!;
    const registry = {
      idOf: (element: Element) => (element.closest("#pay") ? "e.1" : "e.2"),
      elementOf: (id: string) => (id === "e.1" ? pay : undefined),
    } as unknown as PageRegistry;
    return { deps: { registry, ourHostId: "uishapeshifter-root" }, pay, other, ours };
  }

  test("click pe elementul așteptat (sau pe ce e în el): correct", async () => {
    const { deps, pay } = clickDeps();
    const waiting = runPageTool("wait_for_user_click", { elementId: "e.1" }, deps);
    pay.querySelector("span")!.click();
    expect(await waiting).toEqual({ ok: true, data: { clickedElementId: "e.1", correct: true, timedOut: false } });
  });

  test("click pe altceva: ce a apăsat, correct false; click-urile în interfața noastră nu contează", async () => {
    const { deps, other, ours } = clickDeps();
    const waiting = runPageTool("wait_for_user_click", { elementId: "e.1" }, deps);
    ours.click();
    other.click();
    expect(await waiting).toEqual({ ok: true, data: { clickedElementId: "e.2", correct: false, timedOut: false } });
  });

  test("fără click până la timp: timedOut", async () => {
    vi.useFakeTimers();
    const { deps } = clickDeps();
    const waiting = runPageTool("wait_for_user_click", { elementId: "e.1", timeoutMs: 5000 }, deps);
    await vi.advanceTimersByTimeAsync(5000);
    expect(await waiting).toEqual({ ok: true, data: { clickedElementId: null, correct: false, timedOut: true } });
  });

  test("un id care nu mai e în pagină: ELEMENT_NOT_FOUND", async () => {
    const { deps } = clickDeps();
    const result = await runPageTool("wait_for_user_click", { elementId: "e.9" }, deps);
    expect(!result.ok && result.error.code).toBe("ELEMENT_NOT_FOUND");
  });
});

describe("ask_user: întrebarea agentului în chat", () => {
  const registry = {} as PageRegistry;

  test("răspunsul omului ajunge la agent", async () => {
    const askUser = vi.fn().mockResolvedValue("Doar aici");
    const result = await runPageTool(
      "ask_user",
      { question: "Pe tot site-ul sau doar aici?", options: ["Pe tot site-ul", "Doar aici"] },
      { registry, askUser },
    );
    expect(askUser).toHaveBeenCalledWith("Pe tot site-ul sau doar aici?", ["Pe tot site-ul", "Doar aici"]);
    expect(result).toEqual({ ok: true, data: { answer: "Doar aici" } });
  });

  test("fără răspuns: TIMEOUT, ca modelul să meargă mai departe", async () => {
    const result = await runPageTool("ask_user", { question: "Care?" }, { registry, askUser: async () => null });
    expect(!result.ok && result.error.code).toBe("TIMEOUT");
  });

  test("fără întrebare sau cu variante care nu sunt texte: INVALID_ARGS", async () => {
    const askUser = vi.fn();
    expect((await runPageTool("ask_user", {}, { registry, askUser })).ok).toBe(false);
    expect((await runPageTool("ask_user", { question: "?", options: [1] }, { registry, askUser })).ok).toBe(false);
    expect(askUser).not.toHaveBeenCalled();
  });
});

describe("undo_request: „anulează ce am cerut cu X” din chat", () => {
  const registry = {} as PageRegistry;

  test("scoate cererea prin motor și întoarce revizia nouă", async () => {
    const undoRequest = vi.fn().mockResolvedValue({ ok: true, revision: 7, droppedOps: 1 });
    const result = await runPageTool("undo_request", { requestId: "run-1" }, { registry, undoRequest });
    expect(undoRequest).toHaveBeenCalledWith("run-1");
    expect(result).toEqual({ ok: true, data: { revision: 7, droppedOps: 1 } });
  });

  test("cerere necunoscută: INVALID_ARGS, cu unde găsește cererile și ce poate propune", async () => {
    const undoRequest = async () => ({ ok: false as const, message: "Cererea nu mai e în istoricul acestui site." });
    const result = await runPageTool("undo_request", { requestId: "nu-exista" }, { registry, undoRequest });
    expect(!result.ok && result.error.code).toBe("INVALID_ARGS");
    expect(!result.ok && result.error.message).toContain("recipe.requests");
  });

  test("fără requestId: INVALID_ARGS; fără motor: INTERNAL", async () => {
    const undoRequest = vi.fn();
    expect((await runPageTool("undo_request", {}, { registry, undoRequest })).ok).toBe(false);
    expect(undoRequest).not.toHaveBeenCalled();
    const result = await runPageTool("undo_request", { requestId: "run-1" }, { registry });
    expect(!result.ok && result.error.code).toBe("INTERNAL");
  });
});
