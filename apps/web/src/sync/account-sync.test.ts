// Contul în extensie (E6): intrarea în cont schimbă userId-ul și aduce datele; trimiterea; ieșirea păstrează datele.

import { describe, expect, test } from "vitest";
import type { AuthResult, SiteRecipe, SyncBundle } from "@uishapeshifter/contracts";
import {
  ACCOUNT_KEY,
  changeNeedsPush,
  currentAccount,
  pull,
  push,
  signIn,
  signOut,
  type SyncStorage,
} from "./account-sync";

function memory(initial: Record<string, unknown> = {}): SyncStorage & { data: Record<string, unknown> } {
  const data = { ...initial };
  return {
    data,
    get: async (keys) => (keys === null ? { ...data } : Object.fromEntries([keys].flat().map((k) => [k, data[k]]))),
    set: async (items) => void Object.assign(data, items),
    remove: async (keys) => [keys].flat().forEach((k) => delete data[k]),
  };
}

const recipe = (host: string, css: string, updatedAt: string): SiteRecipe => ({ host, revision: 2, css, updatedAt });
const auth: AuthResult = {
  token: "t".repeat(64),
  account: { accountId: "acc-1", username: "Maria", createdAt: "x" },
  userId: "u-laptop",
};
const profile = { userId: "u-laptop", needs: { minFontPx: 22 } };

/** Un server fals care ține minte cererile. */
function server(bundle: SyncBundle, loginStatus = 200) {
  const calls: { method: string; url: string; body?: unknown }[] = [];
  const fetchFn = (async (url: string, init?: RequestInit) => {
    const method = init?.method ?? "GET";
    calls.push({ method, url, body: init?.body ? JSON.parse(String(init.body)) : undefined });
    if (url.endsWith("/accounts/login") || url.endsWith("/accounts/register")) {
      return new Response(
        JSON.stringify(loginStatus === 200 ? auth : { error: "Numele sau parola nu se potrivesc." }),
        {
          status: loginStatus,
        },
      );
    }
    if (url.endsWith("/sync")) return new Response(JSON.stringify(method === "GET" ? bundle : { updatedAt: "x" }));
    return new Response("{}");
  }) as typeof fetch;
  return { fetchFn, calls };
}

const revision = {
  revision: 2,
  css: "#shorts{display:none}",
  reason: "ascunde Shorts",
  at: "2026-11-14T01:00:00.000Z",
};
const bundle: SyncBundle = {
  profile: profile as unknown as SyncBundle["profile"],
  recipes: [recipe("video.example", "#shorts{display:none}", "2026-11-14T01:00:00.000Z")],
  history: [{ host: "video.example", revisions: [revision] }],
  updatedAt: "x",
};

describe("contul în extensie", () => {
  test("login: trimite userId-ul anonim, devine userId-ul contului, aduce profilul și rețetele", async () => {
    const storage = memory({ userId: "u-telefon" });
    const { fetchFn, calls } = server(bundle);
    const result = await signIn("login", "Maria", "parola-test-1", { apiUrl: "http://s/api", storage, fetchFn });
    expect(result.ok).toBe(true);
    expect(calls.find((c) => c.url.endsWith("/accounts/login"))?.body).toMatchObject({ anonymousUserId: "u-telefon" });
    expect(storage.data.userId).toBe("u-laptop");
    expect(storage.data["u-laptop"]).toEqual(profile);
    expect(storage.data["recipe:video.example"]).toMatchObject({
      recipe: { css: "#shorts{display:none}" },
      revisions: [revision],
    });
    expect(JSON.stringify(storage.data)).not.toContain("parola-test-1");
  });

  test("parolă greșită: mesajul serverului, nimic schimbat local", async () => {
    const storage = memory({ userId: "u-telefon" });
    const result = await signIn("login", "Maria", "gresita-12", {
      apiUrl: "http://s/api",
      storage,
      fetchFn: server(bundle, 401).fetchFn,
    });
    expect(result).toEqual({ ok: false, error: "Numele sau parola nu se potrivesc." });
    expect(storage.data.userId).toBe("u-telefon");
    expect(await currentAccount(storage)).toBe(null);
  });

  test("o rețetă locală mai nouă nu e suprascrisă la descărcare", async () => {
    const newer = { recipe: recipe("video.example", "LOCAL", "2026-11-14T05:00:00.000Z"), revisions: [] };
    const storage = memory({ [ACCOUNT_KEY]: auth, userId: "u-laptop", "recipe:video.example": newer });
    await pull({ apiUrl: "http://s/api", storage, fetchFn: server(bundle).fetchFn });
    expect(storage.data["recipe:video.example"]).toEqual(newer);
  });

  test("push trimite profilul și rețetele locale; fără cont nu trimite nimic", async () => {
    const local = { recipe: recipe("a.example", "a{}", "2026-11-14T00:00:00.000Z"), revisions: [revision] };
    const anonymous = memory({ userId: "u-laptop", "u-laptop": profile, "recipe:a.example": local });
    expect(await push({ apiUrl: "http://s/api", storage: anonymous, fetchFn: server(bundle).fetchFn })).toBe(false);
    const signed = memory({ [ACCOUNT_KEY]: auth, userId: "u-laptop", "u-laptop": profile, "recipe:a.example": local });
    const { fetchFn, calls } = server(bundle);
    expect(await push({ apiUrl: "http://s/api", storage: signed, fetchFn })).toBe(true);
    expect(calls[0]).toMatchObject({
      method: "PUT",
      body: { profile, recipes: [local.recipe], history: [{ host: "a.example", revisions: [revision] }] },
    });
  });

  test("ieșirea din cont scoate doar token-ul; ce se trimite: rețete și profil, nu sesiunea", async () => {
    const storage = memory({ [ACCOUNT_KEY]: auth, userId: "u-laptop", "u-laptop": profile });
    await signOut(storage);
    expect(storage.data[ACCOUNT_KEY]).toBeUndefined();
    expect(storage.data["u-laptop"]).toEqual(profile);
    expect(changeNeedsPush(["recipe:a.example"], "u-laptop")).toBe(true);
    expect(changeNeedsPush(["u-laptop"], "u-laptop")).toBe(true);
    expect(changeNeedsPush(["account", "sessionId"], "u-laptop")).toBe(false);
  });
});
