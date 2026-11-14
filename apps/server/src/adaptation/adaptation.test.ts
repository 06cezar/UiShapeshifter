// Adaptarea automată (E3): regulile, propunerea, „Da” / „Nu”, încrederea și aplicarea directă.

import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, test } from "vitest";
import type { PageInfo, ServerMessage, Suggestion, UsageSignal } from "@uishapeshifter/contracts";
import { createProfileStore, type ProfileStore } from "../profile";
import { applyProfileUpdate } from "../profile";
import { COOLDOWN_MS, createAdaptationEngine } from "./engine";
import { DEMO_THRESHOLDS, evaluateRules, generalPreferencesFinding } from "./rules";

const USER = "u-adapt1";
const PAGE = { url: "http://localhost:5180/", host: "localhost", title: "Test" };
const misclick = (elementId = "e.7"): UsageSignal => ({
  kind: "misclick",
  ts: "2026-11-14T00:00:00.000Z",
  x: 10,
  y: 10,
  nearestElementId: elementId,
  distancePx: 6,
});
const zoom = (scale: number): UsageSignal => ({ kind: "zoom", ts: "2026-11-14T00:00:00.000Z", scale });
const decision = (d: "keep" | "undo"): UsageSignal => ({
  kind: "proposal_decision",
  ts: "2026-11-14T00:00:00.000Z",
  proposalId: "p",
  decision: d,
});

describe("regulile", () => {
  test("small-targets: 3 ratări lângă același element în 2 min; 2 nu ajung; la elemente diferite, nu", () => {
    const seen = (ids: string[]) => ids.map((id, i) => ({ signal: misclick(id), at: i * 1000, host: "a.ro" }));
    assert.equal(evaluateRules(seen(["e.1", "e.1"]), 3000).length, 0);
    assert.equal(evaluateRules(seen(["e.1", "e.2", "e.3"]), 3000).length, 0);
    const [found] = evaluateRules(seen(["e.1", "e.1", "e.1"]), 3000);
    assert.equal(found?.rule, "small-targets");
    assert.equal(found?.risk, "low");
    assert.match(found!.goal, /e\.1/);
  });

  test("ratările mai vechi de 2 min nu se numără", () => {
    const seen = [0, 1000, 200_000].map((at) => ({ signal: misclick("e.1"), at }));
    assert.equal(evaluateRules(seen, 200_000).length, 0);
  });

  test("ADAPT_DEMO: 2 ratări ajung", () => {
    const seen = [0, 1000].map((at) => ({ signal: misclick("e.1"), at }));
    assert.equal(evaluateRules(seen, 2000, DEMO_THRESHOLDS)[0]?.rule, "small-targets");
  });

  test("font-too-small: 2 zoom-uri peste 1.2; zoom-uri mici nu", () => {
    const at = (s: UsageSignal, t: number) => ({ signal: s, at: t });
    assert.equal(evaluateRules([at(zoom(1.1), 0), at(zoom(1.1), 1)], 2).length, 0);
    assert.equal(evaluateRules([at(zoom(1.5), 0), at(zoom(1.5), 1)], 2)[0]?.rule, "font-too-small");
  });

  test("general-preferences: doar ce nu s-a aplicat deja pe site", () => {
    const pref = (id: string, appliedOn: string[]) => ({
      id,
      text: id,
      source: "onboarding" as const,
      evidence: [],
      createdAt: "x",
      appliedOn,
    });
    assert.equal(generalPreferencesFinding(PAGE, [pref("fara-ai", ["localhost"])]), null);
    assert.match(
      generalPreferencesFinding(PAGE, [pref("fara-ai", []), pref("fara-shorts", [])])!.text,
      /fara-ai; fara-shorts/,
    );
  });
});

describe("motorul", () => {
  let dir: string;
  let store: ProfileStore;
  let sent: ServerMessage[];
  let runs: string[];
  let runPages: (PageInfo | undefined)[];
  let clock: number;

  function engine(hasTab = true) {
    return createAdaptationEngine({
      store,
      send: (_u, message) => {
        if (!hasTab) return false;
        sent.push(message);
        return true;
      },
      startRun: (_u, goal, page) => {
        runs.push(goal);
        runPages.push(page);
        return hasTab ? "run-1" : null;
      },
      now: () => clock,
      log: () => {},
    });
  }
  const suggestions = () => sent.flatMap((m) => (m.type === "suggestion" ? [m.suggestion] : [])) as Suggestion[];

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), "adapt-"));
    store = createProfileStore(dir);
    sent = [];
    runs = [];
    runPages = [];
    clock = 1_000_000;
  });
  afterEach(() => rm(dir, { recursive: true, force: true }));

  test("3 ratări lângă „Trimite” → propunerea „butoane mai mari”, o singură dată în 10 min", async () => {
    const e = engine();
    await e.onSignals(USER, [misclick(), misclick(), misclick()], PAGE);
    await e.onSignals(USER, [misclick()], PAGE);
    assert.equal(suggestions().length, 1);
    assert.equal(suggestions()[0]?.trigger, "small-targets");
    assert.equal(suggestions()[0]?.text, "Butoanele par greu de apăsat. Le măresc?");
    assert.equal(runs.length, 0, "fără „Da”, agentul nu pornește");
    clock += COOLDOWN_MS + 1;
    await e.onSignals(USER, [misclick(), misclick(), misclick()], PAGE);
    assert.equal(suggestions().length, 2, "după pauză se poate propune din nou");
  });

  test("„Da” pornește agentul cu scopul propunerii", async () => {
    const e = engine();
    await e.onSignals(USER, [misclick(), misclick(), misclick()], PAGE);
    await e.onDecision(USER, suggestions()[0]!.id, "accept");
    assert.equal(runs.length, 1);
    assert.match(runs[0]!, /mărește țintele/);
    assert.deepEqual(runPages[0], PAGE, "agentul știe site-ul de pe care au venit semnalele");
  });

  test("„Nu”: nu se mai propune, nici după pauză, nici după repornirea serverului (fapt în profil)", async () => {
    const e = engine();
    await e.onSignals(USER, [misclick(), misclick(), misclick()], PAGE);
    await e.onDecision(USER, suggestions()[0]!.id, "dismiss");
    clock += COOLDOWN_MS + 1;
    await e.onSignals(USER, [misclick(), misclick(), misclick()], PAGE);
    const fresh = engine(); // „repornire”: memoria motorului e goală, profilul a rămas
    await fresh.onSignals(USER, [misclick(), misclick(), misclick()], PAGE);
    assert.equal(suggestions().length, 1);
    assert.ok((await store.get(USER)).facts.some((f) => f.statement.startsWith("Nu vrea propunerea")));
  });

  test("încrederea: 3 „Păstrez” la rând → schimbările mici se aplică direct; primul „Anulez” o oprește", async () => {
    const e = engine();
    await e.onSignals(USER, [decision("keep"), decision("keep"), decision("keep")], PAGE);
    assert.equal((await store.get(USER)).trust.autoApplyLowRisk, true);
    await e.onSignals(USER, [misclick(), misclick(), misclick()], PAGE);
    assert.equal(suggestions().length, 0, "nu mai întreabă");
    assert.equal(runs.length, 1, "aplică direct");
    await e.onSignals(USER, [decision("undo")], PAGE);
    const trust = (await store.get(USER)).trust;
    assert.deepEqual([trust.accepted, trust.undone, trust.autoApplyLowRisk], [3, 1, false]);
  });

  test("fără tab deschis nu se pierde propunerea: se încearcă la lotul următor", async () => {
    await engine(false).onSignals(USER, [misclick(), misclick(), misclick()], PAGE);
    assert.equal(suggestions().length, 0);
  });

  test("prima dată pe un site cu preferințe generale neaplicate: propunerea, o singură dată", async () => {
    const profile = await store.get(USER);
    const withPref = applyProfileUpdate(
      profile,
      {
        patch: [
          {
            op: "add",
            path: "/generalPreferences/-",
            value: {
              id: "fara-ai",
              category: "ai-features",
              text: "fără rezumate AI",
              source: "conversation",
              evidence: ["„nu vreau AI”"],
              createdAt: "2026-11-14T00:00:00.000Z",
              appliedOn: ["alt.ro"],
            },
          },
        ],
      },
      "2026-11-14T00:00:00.000Z",
    );
    assert.ok(withPref.ok);
    await store.save(withPref.value);
    const e = engine();
    await e.onSignals(USER, [], PAGE);
    await e.onSignals(USER, [], PAGE);
    assert.equal(suggestions().length, 1);
    assert.equal(suggestions()[0]?.trigger, "general-preferences");
    assert.match(suggestions()[0]!.text, /fără rezumate AI/);
  });
});
