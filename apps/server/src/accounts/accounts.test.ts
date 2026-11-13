// Conturile și sincronizarea (E6): parola doar ca hash, login pe alt dispozitiv care îmbină datele, sincronizarea.

import assert from "node:assert/strict";
import { mkdtemp, readdir, readFile, rm } from "node:fs/promises";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, test } from "vitest";
import express from "express";
import type { AuthResult, SiteRecipe, SyncBundle, UserProfile } from "@uishapeshifter/contracts";
import { createProfileStore } from "../profile";
import { saveRecipe } from "../recipes/recipe-store";
import { mergeProfiles, mergeRecipes } from "./merge";
import { createAccountsRouter } from "./routes";

let dir: string;
let base: string;
let close: () => void;
const store = () => createProfileStore(join(dir, "profiles"));

beforeAll(async () => {
  dir = await mkdtemp(join(tmpdir(), "accounts-"));
  process.env.DATA_DIR = dir;
  const app = express();
  app.use(express.json());
  app.use("/api", createAccountsRouter(store()));
  const server = app.listen(0);
  await new Promise((resolve) => server.once("listening", resolve));
  base = `http://localhost:${(server.address() as AddressInfo).port}/api`;
  close = () => server.close();
});
afterAll(async () => {
  close();
  delete process.env.DATA_DIR;
  await rm(dir, { recursive: true, force: true });
});

const post = (path: string, body: unknown) =>
  fetch(`${base}${path}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
const recipe = (host: string, css: string, updatedAt: string): SiteRecipe => ({ host, revision: 1, css, updatedAt });

describe("conturile", () => {
  test("înregistrare: datele anonime devin ale contului; parola nu e pe disc, doar hash-ul", async () => {
    const res = await post("/accounts/register", {
      username: "Maria",
      password: "parola-test-1",
      anonymousUserId: "u-laptop",
    });
    assert.equal(res.status, 200);
    const auth = (await res.json()) as AuthResult;
    assert.equal(auth.userId, "u-laptop");
    assert.equal(auth.account.username, "Maria");
    assert.ok(auth.token.length >= 32);
    const files = await readdir(join(dir, "accounts"));
    const onDisk = (await Promise.all(files.map((f) => readFile(join(dir, "accounts", f), "utf8")))).join("");
    assert.ok(!onDisk.includes("parola-test-1"), "parola nu apare pe disc");
    assert.ok(!onDisk.includes(auth.token), "nici token-ul");
    assert.match(onDisk, /scrypt\$/);
  });

  test("același nume, alt caz: 409; parolă scurtă: 400; parolă greșită: 401, fără să spună de ce", async () => {
    assert.equal(
      (await post("/accounts/register", { username: "maria", password: "altaparola1", anonymousUserId: "u-x" })).status,
      409,
    );
    assert.equal(
      (await post("/accounts/register", { username: "ion", password: "scurt", anonymousUserId: "u-y" })).status,
      400,
    );
    const wrong = await post("/accounts/login", { username: "Maria", password: "gresita-123", anonymousUserId: "u-z" });
    assert.equal(wrong.status, 401);
    assert.match(((await wrong.json()) as { error: string }).error, /Numele sau parola/);
  });

  test("login pe alt dispozitiv: preferințele și rețetele de pe laptop apar; ce era pe telefon se îmbină", async () => {
    const s = store();
    const laptop = await s.get("u-laptop");
    await s.save({
      ...laptop,
      onboarding: { completed: true, skipped: false },
      needs: { ...laptop.needs, minFontPx: 20 },
      generalPreferences: [
        {
          id: "ai-features",
          category: "ai-features",
          text: "fără rezumate AI",
          source: "onboarding",
          evidence: [],
          createdAt: "x",
          appliedOn: [],
        },
      ],
    });
    await saveRecipe("u-laptop", recipe("video.example", "#shorts{display:none}", "2026-11-14T00:00:00.000Z"));
    const phone = await s.get("u-telefon");
    await s.save({
      ...phone,
      onboarding: { completed: true, skipped: false },
      needs: { ...phone.needs, minFontPx: 24 },
    });
    await saveRecipe("u-telefon", recipe("stiri.example", ".ad{display:none}", "2026-11-14T00:00:00.000Z"));

    const login = await post("/accounts/login", {
      username: "MARIA",
      password: "parola-test-1",
      anonymousUserId: "u-telefon",
    });
    assert.equal(login.status, 200);
    const auth = (await login.json()) as AuthResult;
    assert.equal(auth.userId, "u-laptop", "după login, extensia folosește userId-ul contului");

    const bundle = (await (
      await fetch(`${base}/sync`, { headers: { authorization: `Bearer ${auth.token}` } })
    ).json()) as SyncBundle;
    assert.equal(bundle.profile.needs.minFontPx, 24, "la îmbinare nevoile iau valoarea mai mare");
    assert.deepEqual(
      bundle.profile.generalPreferences?.map((p) => p.text),
      ["fără rezumate AI"],
    );
    assert.deepEqual(
      bundle.recipes.map((r) => r.host),
      ["stiri.example", "video.example"],
    );
  });

  test("sync fără token sau cu token greșit: 401; PUT îmbină, nu suprascrie", async () => {
    assert.equal((await fetch(`${base}/sync`)).status, 401);
    assert.equal((await fetch(`${base}/sync`, { headers: { authorization: "Bearer gresit" } })).status, 401);
    const auth = (await (
      await post("/accounts/login", { username: "maria", password: "parola-test-1", anonymousUserId: "u-laptop" })
    ).json()) as AuthResult;
    const headers = { authorization: `Bearer ${auth.token}`, "content-type": "application/json" };
    const current = (await (await fetch(`${base}/sync`, { headers })).json()) as SyncBundle;
    const put = await fetch(`${base}/sync`, {
      method: "PUT",
      headers,
      body: JSON.stringify({
        profile: { ...current.profile, needs: { ...current.profile.needs, minFontPx: 18 } },
        recipes: [recipe("video.example", "#shorts{display:none} .ai{display:none}", "2026-11-14T01:00:00.000Z")],
        updatedAt: "x",
      }),
    });
    assert.equal(put.status, 200);
    const after = (await (await fetch(`${base}/sync`, { headers })).json()) as SyncBundle;
    assert.equal(after.profile.needs.minFontPx, 24, "un dispozitiv cu font mai mic nu coboară minimul");
    assert.match(after.recipes.find((r) => r.host === "video.example")!.css, /\.ai/);
    assert.equal(after.recipes.length, 2);
  });
});

describe("îmbinarea", () => {
  test("rețete: cea mai nouă câștigă pe același site", () => {
    const merged = mergeRecipes(
      [recipe("a.ro", "vechi", "2026-11-14T00:00:00.000Z")],
      [recipe("a.ro", "nou", "2026-11-14T02:00:00.000Z"), recipe("b.ro", "b", "2026-11-14T00:00:00.000Z")],
    );
    assert.deepEqual(
      merged.map((r) => r.css),
      ["nou", "b"],
    );
  });

  test("profil: încrederea pentru aplicare automată rămâne doar dacă ambele o aveau", async () => {
    const s = store();
    const a = { ...(await s.get("u-a")), trust: { accepted: 3, undone: 0, autoApplyLowRisk: true } } as UserProfile;
    const b = { ...(await s.get("u-b")), trust: { accepted: 1, undone: 1, autoApplyLowRisk: false } } as UserProfile;
    assert.deepEqual(mergeProfiles(a, b, "x").trust, { accepted: 3, undone: 1, autoApplyLowRisk: false });
  });
});
