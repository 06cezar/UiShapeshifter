// get_profile / update_profile / finish pe store-ul lui E, într-un folder temporar (nu în data/ din repo).

import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { UserProfile } from "@uishapeshifter/contracts";
import { createProfileStore, type ProfileStore } from "../profile";
import { callServerTool } from "./server-tools";

let dir: string;
let store: ProfileStore;
const call = (name: Parameters<typeof callServerTool>[2], args: unknown) =>
  callServerTool("run-1", "maria", name, args, store);

beforeAll(async () => {
  dir = await mkdtemp(join(tmpdir(), "uishapeshifter-profile-"));
  store = createProfileStore(dir);
});

afterAll(async () => {
  await rm(dir, { recursive: true, force: true });
});

describe("uneltele de pe server", () => {
  it("finish întoarce runId", async () => {
    expect(await call("finish", { summary: "x", success: true })).toEqual({ ok: true, data: { runId: "run-1" } });
  });

  it("get_profile dă profilul (creat la prima cerere)", async () => {
    const result = await call("get_profile", {});
    expect(result.ok && (result.data as UserProfile).userId).toBe("maria");
  });

  it("update_profile salvează un fapt cu dovezi", async () => {
    const result = await call("update_profile", {
      facts: [
        {
          statement: "Nu vrea clipuri scurte",
          evidence: ["„nu vreau Shorts”"],
          confidence: 0.8,
          source: "conversation",
        },
      ],
    });
    expect(result.ok).toBe(true);
    const profile = (await call("get_profile", {})) as { data: UserProfile };
    expect(profile.data.facts.map((fact) => fact.statement)).toContain("Nu vrea clipuri scurte");
  });

  it("refuză faptele fără dovezi și argumentele stricate cu INVALID_ARGS", async () => {
    const noEvidence = await call("update_profile", {
      facts: [{ statement: "Îi place albastrul", evidence: [], confidence: 0.5, source: "conversation" }],
    });
    expect(noEvidence).toMatchObject({ ok: false, error: { code: "INVALID_ARGS" } });
    expect(await call("update_profile", { facts: "nu e listă" })).toMatchObject({
      ok: false,
      error: { code: "INVALID_ARGS" },
    });
    expect(await call("update_profile", {})).toMatchObject({ ok: false, error: { code: "INVALID_ARGS" } });
  });

  it("agentul nu poate micșora fontul minim al omului", async () => {
    const result = await call("update_profile", { patch: [{ op: "replace", path: "/needs/minFontPx", value: 16 }] });
    expect(result).toMatchObject({ ok: false, error: { code: "INVALID_ARGS" } });
  });

  it("preferința generală: păstrată după E8; înainte, refuzată explicit (nu pierdută în tăcere)", async () => {
    const result = await call("update_profile", {
      patch: [
        {
          op: "add",
          path: "/generalPreferences/-",
          value: {
            id: "fara-ai",
            category: "ai-features",
            text: "fără AI în site-uri",
            source: "conversation",
            evidence: ["„nu vreau AI”"],
            createdAt: "2026-11-13T22:00:00.000Z",
            appliedOn: ["cautare.example"],
          },
        },
      ],
    });
    const saved = (await call("get_profile", {})) as { data: UserProfile };
    if (saved.data.generalPreferences?.length) {
      expect(result.ok).toBe(true); // după E8: păstrată
    } else {
      // E1 permite patch doar pe /needs, /preferences, /persona; E8 deschide /generalPreferences
      expect(result.ok).toBe(false);
    }
  });
});
