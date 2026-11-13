import { describe, expect, test, vi } from "vitest";
import type { PageRegistry } from "../ui/page-registry/registry";
import { runPageTool, type PageToolDeps } from "./page-tools";

function deps(elements: Record<string, Element>, pointAt?: PageToolDeps["pointAt"]): PageToolDeps {
  const registry = {
    idOf: () => "e.0",
    elementOf: (id: string) => elements[id],
    snapshot: () => {
      throw new Error("nefolosit aici");
    },
  } as PageRegistry;
  return { registry, pointAt };
}

describe("point_at", () => {
  test("fără elementId sau message: INVALID_ARGS", async () => {
    const result = await runPageTool("point_at", { elementId: "e.1" }, deps({}));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("INVALID_ARGS");
  });

  test("un id care nu mai e în pagină: ELEMENT_NOT_FOUND, mascota nu pleacă", async () => {
    const pointAt = vi.fn();
    const result = await runPageTool("point_at", { elementId: "e.9", message: "Aici." }, deps({}, pointAt));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("ELEMENT_NOT_FOUND");
    expect(pointAt).not.toHaveBeenCalled();
  });

  test("fără mascotă montată: INTERNAL", async () => {
    const button = document.createElement("button");
    const result = await runPageTool("point_at", { elementId: "e.1", message: "Aici." }, deps({ "e.1": button }));
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
      deps({ "e.1": button }, pointAt),
    );

    expect(pointAt).toHaveBeenCalledWith(button, "Apasă aici.");
    expect(result).toEqual({ ok: true, data: { scrolledIntoView: false, rect } });
  });
});
