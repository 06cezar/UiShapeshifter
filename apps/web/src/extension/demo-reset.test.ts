// Uneltele de demo (E4): resetarea curăță tot ce ține de om (local și pe server); profilul de demo din specs/08.

import { describe, expect, test } from "vitest";
import { DEMO_ONBOARDING, loadDemoProfile, resetDemo, type DemoStorage } from "./demo-reset";

function memory(initial: Record<string, unknown>): DemoStorage & { data: Record<string, unknown> } {
  const data = { ...initial };
  return {
    data,
    get: async (keys) => (keys === null ? { ...data } : Object.fromEntries([keys].flat().map((k) => [k, data[k]]))),
    set: async (items) => void Object.assign(data, items),
    remove: async (keys) => [keys].flat().forEach((k) => delete data[k]),
  };
}

function server(ok = true) {
  const calls: string[] = [];
  const fetchFn = (async (url: string, init?: RequestInit) => {
    calls.push(`${init?.method ?? "GET"} ${url}`);
    if (!ok) throw new TypeError("Failed to fetch");
    return new Response(JSON.stringify({ userId: "u-1", needs: DEMO_ONBOARDING.needs }));
  }) as typeof fetch;
  return { fetchFn, calls };
}

const full = () => ({
  userId: "u-1",
  sessionId: "s",
  "u-1": { userId: "u-1" },
  onboarding: { skipped: false },
  account: { token: "t" },
  "recipe:video.example": { recipe: {} },
  "recipe:a.ro": { recipe: {} },
});

describe("resetarea demo-ului", () => {
  test("șterge rețetele (și pe server), profilul, contul, testul; păstrează userId-ul", async () => {
    const storage = memory(full());
    const { fetchFn, calls } = server();
    expect(await resetDemo({ apiUrl: "http://s/api", storage, fetchFn })).toEqual({ recipes: 2, server: true });
    expect(Object.keys(storage.data).sort()).toEqual(["sessionId", "userId"]);
    expect(calls).toEqual([
      "DELETE http://s/api/profile/u-1",
      "DELETE http://s/api/recipes/u-1/video.example",
      "DELETE http://s/api/recipes/u-1/a.ro",
    ]);
  });

  test("fără server curăță totuși local", async () => {
    const storage = memory(full());
    expect(await resetDemo({ apiUrl: "http://s/api", storage, fetchFn: server(false).fetchFn })).toEqual({
      recipes: 2,
      server: false,
    });
    expect(storage.data["recipe:a.ro"]).toBeUndefined();
  });
});

describe("profilul de demo", () => {
  test("e cel din specs/08 și ajunge local și pe server", async () => {
    expect(DEMO_ONBOARDING.needs).toMatchObject({ minFontPx: 20, contrast: "high" });
    expect(DEMO_ONBOARDING.dislikes).toEqual(["ai-features", "short-video"]);
    const storage = memory({ userId: "u-1" });
    const { fetchFn, calls } = server();
    expect(await loadDemoProfile({ apiUrl: "http://s/api", storage, fetchFn })).toBe(true);
    expect(calls).toEqual(["PUT http://s/api/profile/u-1/onboarding"]);
    expect(storage.data.onboarding).toEqual(DEMO_ONBOARDING);
    expect(storage.data["u-1"]).toMatchObject({ needs: { minFontPx: 20 } });
  });
});
