// get_profile / update_profile / finish pe store-ul lui E, într-un DATA_DIR temporar.

import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { UserProfile } from "@uishapeshifter/contracts";

let dataDir: string;
let callServerTool: typeof import("./server-tools").callServerTool;

beforeAll(async () => {
  dataDir = await mkdtemp(join(tmpdir(), "uishapeshifter-tools-"));
  process.env.DATA_DIR = dataDir;
  ({ callServerTool } = await import("./server-tools")); // după env, ca store-ul să scrie în folderul temporar
});

afterAll(async () => {
  await rm(dataDir, { recursive: true, force: true });
});

describe("uneltele de pe server", () => {
  it("finish întoarce runId", async () => {
    expect(await callServerTool("run-1", "maria", "finish", { summary: "x", success: true })).toEqual({
      ok: true,
      data: { runId: "run-1" },
    });
  });

  it("get_profile dă profilul (creat la prima cerere)", async () => {
    const result = await callServerTool("run-1", "maria", "get_profile", {});
    expect(result.ok).toBe(true);
    expect((result as { data: UserProfile }).data.userId).toBe("maria");
  });

  it("update_profile salvează un fapt cu dovezi", async () => {
    const result = await callServerTool("run-1", "maria", "update_profile", {
      facts: [
        {
          statement: "Ratează des butonul Trimite",
          evidence: ["run-1#3"],
          confidence: 0.7,
          source: "usage",
        },
      ],
    });
    expect(result.ok).toBe(true);
    const profile = (await callServerTool("run-1", "maria", "get_profile", {})) as { data: UserProfile };
    expect(profile.data.facts.map((fact) => fact.statement)).toContain("Ratează des butonul Trimite");
  });

  it("refuză faptele fără dovezi și argumentele stricate cu INVALID_ARGS", async () => {
    const noEvidence = await callServerTool("run-1", "maria", "update_profile", {
      facts: [{ statement: "Îi place albastrul", evidence: [], confidence: 0.5, source: "conversation" }],
    });
    expect(noEvidence).toMatchObject({ ok: false, error: { code: "INVALID_ARGS" } });
    expect(await callServerTool("run-1", "maria", "update_profile", { facts: "nu e listă" })).toMatchObject({
      ok: false,
      error: { code: "INVALID_ARGS" },
    });
    expect(await callServerTool("run-1", "maria", "update_profile", {})).toMatchObject({
      ok: false,
      error: { code: "INVALID_ARGS" },
    });
  });

  it("agentul nu poate micșora fontul minim al omului", async () => {
    const result = await callServerTool("run-1", "maria", "update_profile", {
      patch: [{ op: "replace", path: "/needs/minFontPx", value: 16 }],
    });
    expect(result).toMatchObject({ ok: false, error: { code: "INVALID_ARGS" } });
  });
});
