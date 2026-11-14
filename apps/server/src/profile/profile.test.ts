// Testele profilului (E1). Rulare: npm test -w @uishapeshifter/server

import assert from "node:assert/strict";
import { mkdtemp, readdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, test } from "vitest";
import express from "express";
import type { UserProfile } from "@uishapeshifter/contracts";
import { createEmptyProfile, createMariaProfile } from "./defaults";
import { createProfileRouter } from "./routes";
import { createProfileStore, type ProfileStore } from "./store";
import { MAX_SUMMARY_WORDS, profileSummary } from "./summary";
import { applyOnboarding, applyProfileUpdate } from "./update";
import { parseProfile } from "./validate";

const NOW = "2026-11-13T18:00:00.000Z";
const words = (text: string) => text.split(/\s+/).filter(Boolean).length;

let dir: string;
let store: ProfileStore;

beforeAll(async () => {
  dir = await mkdtemp(join(tmpdir(), "profiles-"));
  store = createProfileStore(dir);
});
afterAll(() => rm(dir, { recursive: true, force: true }));

describe("stocarea", () => {
  test("maria pornește cu profilul din specs/08 și se salvează pe disc", async () => {
    const maria = await store.get("maria");
    assert.equal(maria.needs.minFontPx, 20);
    assert.equal(maria.needs.minTargetPx, 56);
    assert.deepEqual(maria.persona.keyContacts, ["ana", "ion"]);
    const onDisk = JSON.parse(await readFile(join(dir, "maria.json"), "utf8")) as UserProfile;
    assert.equal(onDisk.displayName, "Maria");
  });

  test("demo-fresh pornește fără test inițial și cu nevoile implicite", async () => {
    const fresh = await store.get("demo-fresh");
    assert.equal(fresh.onboarding.completed, false);
    assert.equal(fresh.needs.minFontPx, 16);
  });

  test("un fișier stricat e păstrat ca .bad și profilul se reface", async () => {
    await writeFile(join(dir, "stricat.json"), "{ nu e json", "utf8");
    const profile = await store.get("stricat");
    assert.equal(profile.userId, "stricat");
    await stat(join(dir, "stricat.json.bad"));
  });

  test("userId care ar ieși din folder e refuzat", async () => {
    await assert.rejects(store.get("../secret"));
  });

  test("salvări simultane ale aceluiași profil nu se încurcă și nu lasă fișiere temporare", async () => {
    const maria = await store.get("maria");
    const names = Array.from({ length: 20 }, (_, i) => `Maria ${i}`);
    await Promise.all(names.map((displayName) => store.save({ ...maria, displayName })));
    assert.ok(names.includes((await store.get("maria")).displayName));
    assert.deepEqual(
      (await readdir(dir)).filter((file) => file.endsWith(".tmp")),
      [],
    );
  });
});

describe("validarea", () => {
  test("nevoile sunt aduse în HARD_LIMITS", () => {
    const raw = {
      ...createMariaProfile(NOW),
      needs: { ...createMariaProfile(NOW).needs, minFontPx: 10, minTargetPx: 20 },
    };
    const parsed = parseProfile(raw);
    assert.ok(parsed.ok);
    assert.equal(parsed.value.needs.minFontPx, 16);
    assert.equal(parsed.value.needs.minTargetPx, 44);
  });

  test("un câmp de tip greșit e refuzat cu numele câmpului", () => {
    const parsed = parseProfile({ ...createMariaProfile(NOW), persona: { techComfort: "foarte" } });
    assert.ok(!parsed.ok);
    assert.match(parsed.error, /persona\.techComfort/);
  });
});

describe("testul inițial", () => {
  test("rezultatul se adaugă peste profil și marchează testul ca făcut", () => {
    const start = createMariaProfile(NOW);
    const result = applyOnboarding(
      { ...start, onboarding: { completed: false, skipped: false } },
      { skipped: false, needs: { minFontPx: 24 }, persona: { goals: ["văd poze"] }, answers: [] },
      NOW,
    );
    assert.ok(result.ok);
    assert.equal(result.value.needs.minFontPx, 24);
    assert.equal(result.value.needs.minTargetPx, 56);
    assert.deepEqual(result.value.persona.goals, ["văd poze"]);
    assert.equal(result.value.onboarding.completed, true);
  });

  test("testul sărit nu schimbă nevoile", () => {
    const result = applyOnboarding(createMariaProfile(NOW), { skipped: true, answers: [] }, NOW);
    assert.ok(result.ok);
    assert.equal(result.value.onboarding.skipped, true);
    assert.equal(result.value.needs.minFontPx, 20);
  });
});

describe("update_profile", () => {
  const fact = {
    statement: "Apasă des lângă butoane mici.",
    evidence: ["sig-1"],
    confidence: 0.6,
    source: "usage" as const,
  };

  test("un fapt fără dovezi e refuzat", () => {
    const result = applyProfileUpdate(createMariaProfile(NOW), { facts: [{ ...fact, evidence: [] }] }, NOW);
    assert.ok(!result.ok);
    assert.match(result.error, /dovad/);
  });

  test("un fapt confirmat din nou crește încrederea cu 0.1 și adună dovezile", () => {
    const first = applyProfileUpdate(createMariaProfile(NOW), { facts: [fact] }, NOW);
    assert.ok(first.ok);
    const again = applyProfileUpdate(first.value, { facts: [{ ...fact, evidence: ["sig-2"] }] }, NOW);
    assert.ok(again.ok);
    assert.equal(again.value.facts.length, 1);
    assert.equal(again.value.facts[0]!.confidence, 0.7);
    assert.deepEqual(again.value.facts[0]!.evidence, ["sig-1", "sig-2"]);
    assert.equal(again.value.facts[0]!.lastConfirmedAt, NOW);
  });

  test("patch-ul poate crește fontul și adăuga un scop", () => {
    const result = applyProfileUpdate(
      createMariaProfile(NOW),
      {
        patch: [
          { op: "replace", path: "/needs/minFontPx", value: 22 },
          { op: "add", path: "/persona/goals/-", value: "trimit poze lui Ion" },
        ],
      },
      NOW,
    );
    assert.ok(result.ok);
    assert.equal(result.value.needs.minFontPx, 22);
    assert.equal(result.value.persona.goals.at(-1), "trimit poze lui Ion");
  });

  test("agentul nu poate micșora fontul sau țintele", () => {
    const font = applyProfileUpdate(
      createMariaProfile(NOW),
      { patch: [{ op: "replace", path: "/needs/minFontPx", value: 18 }] },
      NOW,
    );
    assert.ok(!font.ok);
    const target = applyProfileUpdate(
      createMariaProfile(NOW),
      { patch: [{ op: "replace", path: "/needs/minTargetPx", value: 48 }] },
      NOW,
    );
    assert.ok(!target.ok);
  });

  test("agentul nu poate atinge trust sau căi periculoase", () => {
    const trust = applyProfileUpdate(
      createMariaProfile(NOW),
      { patch: [{ op: "replace", path: "/trust/accepted", value: 99 }] },
      NOW,
    );
    assert.ok(!trust.ok);
    const proto = applyProfileUpdate(
      createMariaProfile(NOW),
      { patch: [{ op: "add", path: "/persona/__proto__/x", value: 1 }] },
      NOW,
    );
    assert.ok(!proto.ok);
  });
});

describe("rezumatul pentru prompt", () => {
  test("maria: nevoile, persona și sub 150 de cuvinte", () => {
    const summary = profileSummary(createMariaProfile(NOW));
    assert.match(summary, /font minim 20px/);
    assert.match(summary, /contrast ridicat/);
    assert.match(summary, /nepoata Ana/);
    assert.ok(words(summary) <= MAX_SUMMARY_WORDS, `${words(summary)} cuvinte`);
  });

  test("cu multe fapte lungi tot rămâne sub limită și păstrează nevoile", () => {
    const long = "Un fapt foarte lung despre cum folosește aplicația în fiecare dimineață după cafea ".repeat(3);
    const maria = createMariaProfile(NOW);
    const profile: UserProfile = {
      ...maria,
      facts: Array.from({ length: 10 }, (_, i) => ({
        id: `f${i}`,
        statement: `${long} ${i}`,
        evidence: ["x"],
        confidence: i / 10,
        source: "usage",
        createdAt: NOW,
      })),
    };
    const summary = profileSummary(profile);
    assert.ok(words(summary) <= MAX_SUMMARY_WORDS, `${words(summary)} cuvinte`);
    assert.match(summary, /Nevoi \(obligatorii\)/);
  });
});

describe("rutele HTTP", () => {
  let base: string;
  let close: () => void;
  const onboardedUsers: string[] = [];

  beforeAll(async () => {
    const app = express();
    app.use(express.json());
    const hooks = { onOnboardingCompleted: (userId: string) => void onboardedUsers.push(userId) };
    app.use("/api/profile", createProfileRouter(createProfileStore(dir), hooks));
    const server = app.listen(0);
    await new Promise((resolve) => server.once("listening", resolve));
    base = `http://localhost:${(server.address() as AddressInfo).port}/api/profile`;
    close = () => server.close();
  });
  afterAll(() => close());

  const send = (method: string, path: string, body?: unknown) =>
    fetch(`${base}${path}`, { method, headers: { "content-type": "application/json" }, body: JSON.stringify(body) });

  test("GET, PUT onboarding, PUT profil, DELETE", async () => {
    const created = (await (await fetch(`${base}/http-user`)).json()) as UserProfile;
    assert.equal(created.onboarding.completed, false);

    const onboarded = await send("PUT", "/http-user/onboarding", {
      skipped: false,
      needs: { minFontPx: 22 },
      answers: [],
    });
    assert.equal(onboarded.status, 200);
    assert.equal(((await onboarded.json()) as UserProfile).needs.minFontPx, 22);

    const edited = await send("PUT", "/http-user", { ...created, displayName: "Ion" });
    assert.equal(edited.status, 200);
    assert.equal(((await (await fetch(`${base}/http-user`)).json()) as UserProfile).displayName, "Ion");

    const reset = (await (await send("DELETE", "/http-user")).json()) as UserProfile;
    assert.equal(reset.displayName, "http-user");
  });

  test("testul făcut pornește agentul; testul sărit nu", async () => {
    onboardedUsers.length = 0;
    await send("PUT", "/hook-done/onboarding", { skipped: false, answers: [] });
    await send("PUT", "/hook-skip/onboarding", { skipped: true, answers: [] });
    assert.deepEqual(onboardedUsers, ["hook-done"]);
  });

  test("erorile sunt 400 cu { error }", async () => {
    const wrongBody = await send("PUT", "/maria", { userId: "maria" });
    assert.equal(wrongBody.status, 400);
    assert.ok(((await wrongBody.json()) as { error: string }).error);

    const otherUser = await send("PUT", "/maria", { ...createMariaProfile(NOW), userId: "ion" });
    assert.equal(otherUser.status, 400);

    const badId = await fetch(`${base}/bad.id`);
    assert.equal(badId.status, 400);
  });
});

describe("profilul extins (E8): preferințe generale și site-uri familiare", () => {
  // exact ce trimite agentul din A6 (system-prompt + server-tools.test)
  const fromAgent = {
    id: "fara-ai",
    category: "ai-features",
    text: "fără AI în site-uri",
    source: "conversation",
    evidence: ["„nu vreau AI”"],
    createdAt: NOW,
    appliedOn: ["cautare.example"],
  };
  const addPreference = (value: unknown) => ({ patch: [{ op: "add" as const, path: "/generalPreferences/-", value }] });

  test("add pe /generalPreferences/- merge și pe un profil vechi, fără câmpul nou", () => {
    const old = createMariaProfile(NOW);
    delete old.generalPreferences;
    const result = applyProfileUpdate(old, addPreference(fromAgent), NOW);
    assert.ok(result.ok, result.ok ? "" : result.error);
    assert.deepEqual(
      result.value.generalPreferences?.map((p) => p.text),
      ["fără AI în site-uri"],
    );
  });

  test("fără dovezi, cu categorie necunoscută sau cu text gol: refuzat", () => {
    for (const bad of [
      { ...fromAgent, evidence: [] },
      { ...fromAgent, category: "orice" },
      { ...fromAgent, text: "  " },
    ]) {
      assert.ok(!applyProfileUpdate(createMariaProfile(NOW), addPreference(bad), NOW).ok);
    }
  });

  test("aceeași categorie spusă din nou nu se dublează: dovezile și site-urile se adună", () => {
    const first = applyProfileUpdate(createMariaProfile(NOW), addPreference(fromAgent), NOW);
    assert.ok(first.ok);
    const again = applyProfileUpdate(
      first.value,
      addPreference({ ...fromAgent, id: "nu-ai", evidence: ["„scoate AI”"], appliedOn: ["WWW.Video.example"] }),
      NOW,
    );
    assert.ok(again.ok);
    assert.equal(again.value.generalPreferences?.length, 1);
    assert.deepEqual(again.value.generalPreferences?.[0]?.appliedOn, ["cautare.example", "video.example"]);
    assert.equal(again.value.generalPreferences?.[0]?.evidence.length, 2);
  });

  test("testul inițial: „ce te deranjează” devine preferințe generale, „ce site-uri cunoști” site-uri familiare", () => {
    const result = applyOnboarding(
      createEmptyProfile("demo-fresh", NOW),
      {
        skipped: false,
        dislikes: ["ai-features", "short-video"],
        familiarSites: ["www.YouTube.com", "youtube.com"],
        answers: [],
      },
      NOW,
    );
    assert.ok(result.ok, result.ok ? "" : result.error);
    assert.deepEqual(
      result.value.generalPreferences?.map((p) => p.category),
      ["ai-features", "short-video"],
    );
    assert.ok(result.value.generalPreferences?.every((p) => p.source === "onboarding"));
    assert.deepEqual(result.value.familiarSites, [{ host: "youtube.com", level: "daily", source: "onboarding" }]);
  });

  test("rezumatul pentru prompt include preferințele generale și site-urile cunoscute, sub limită", () => {
    const result = applyOnboarding(
      createMariaProfile(NOW),
      { skipped: false, dislikes: ["ai-features", "promos"], familiarSites: ["youtube.com"], answers: [] },
      NOW,
    );
    assert.ok(result.ok);
    const summary = profileSummary(result.value);
    assert.match(summary, /Vrea peste tot: fără rezumate și butoane AI; fără bannere și reclame\./);
    assert.match(summary, /Site-uri cunoscute bine: youtube\.com\./);
    assert.ok(words(summary) <= MAX_SUMMARY_WORDS);
  });

  test("un profil vechi din data/ (fără câmpurile noi) se citește cu liste goale", () => {
    const old = createMariaProfile(NOW) as Partial<UserProfile>;
    delete old.generalPreferences;
    delete old.familiarSites;
    const parsed = parseProfile(old);
    assert.ok(parsed.ok);
    assert.deepEqual(parsed.value.generalPreferences, []);
    assert.deepEqual(parsed.value.familiarSites, []);
  });
});
