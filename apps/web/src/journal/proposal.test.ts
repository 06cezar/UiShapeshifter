import { describe, expect, test, vi } from "vitest";
import { proposeChanges, type ProposalDeps } from "./proposal";

function deps(decision: "keep" | "undo"): ProposalDeps & { undoRun: ReturnType<typeof vi.fn> } {
  return {
    ask: vi.fn(async () => decision),
    revisionBefore: () => 3,
    currentRevision: () => 5,
    undoRun: vi.fn(async () => 6),
  };
}

const ARGS = { title: " Căutarea sus ", summary: "Am mutat căutarea deasupra meniului.", risk: "low" };

describe("propose_changes", () => {
  test("Păstrez: rețeta rămâne, revizia e cea de acum", async () => {
    const d = deps("keep");
    const result = await proposeChanges(ARGS, "r1", d);
    expect(result.ok && result.data).toMatchObject({ decision: "keep", revision: 5 });
    expect(d.undoRun).not.toHaveBeenCalled();
    expect(d.ask).toHaveBeenCalledWith(expect.objectContaining({ title: "Căutarea sus", revisionBefore: 3 }));
  });

  test("Anulez: readuce rețeta de la începutul rulării", async () => {
    const d = deps("undo");
    const result = await proposeChanges(ARGS, "r1", d);
    expect(d.undoRun).toHaveBeenCalledWith("r1");
    expect(result.ok && result.data).toMatchObject({ decision: "undo", revision: 6 });
  });

  test("fără titlu sau rezumat: INVALID_ARGS, fără bară", async () => {
    const d = deps("keep");
    const result = await proposeChanges({ title: "x" }, "r1", d);
    expect(result.ok ? null : result.error.code).toBe("INVALID_ARGS");
    expect(d.ask).not.toHaveBeenCalled();
  });
});
