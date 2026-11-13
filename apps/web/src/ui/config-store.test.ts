import { describe, expect, it } from "vitest";
import { DEFAULT_CONFIG } from "@uishapeshifter/contracts";
import { createConfigStore } from "./config-store";
import type { ChangeMeta } from "./config-store";
import { fakeContrast, HIGH_CONTRAST_THRESHOLDS, NORMAL_THRESHOLDS } from "./test-fixtures";

const AGENT: ChangeMeta = { by: "agent", reason: "Textul e greu de citit", runId: "run-1" };
const FIXED_TIME = "2026-11-13T15:00:00.000Z";

function newStore() {
  return createConfigStore({ contrastRatio: fakeContrast(), thresholds: NORMAL_THRESHOLDS, now: () => FIXED_TIME });
}

const setFont = (value: number) => [{ op: "replace" as const, path: "/theme/baseFontPx", value }];

describe("createConfigStore", () => {
  it("pornește de la DEFAULT_CONFIG, revizia 0, pe ecranul principal", () => {
    const state = newStore().getState();
    expect(state.config).toEqual(DEFAULT_CONFIG);
    expect(state.config).not.toBe(DEFAULT_CONFIG);
    expect(state.history).toHaveLength(1);
    expect(state.history[0]).toMatchObject({ revision: 0, meta: { by: "system" } });
    expect(state.route).toBe("home");
    expect(state.openOverlays).toEqual([]);
  });

  it("criteriul B1: applyPatch refuză baseFontPx 14 și nu schimbă nimic", () => {
    const store = newStore();
    const result = store.getState().applyPatch(setFont(14), AGENT);
    expect(result).toMatchObject({ ok: false, violations: [{ rule: "min-font", limit: 16 }] });
    expect(store.getState().config.revision).toBe(0);
    expect(store.getState().history).toHaveLength(1);
  });

  it("aplică baseFontPx 20, crește revizia și scrie meta în istoric", () => {
    const store = newStore();
    const result = store.getState().applyPatch(setFont(20), AGENT);
    expect(result).toEqual({ ok: true, revision: 1, applied: 1 });
    const { config, history } = store.getState();
    expect(config.theme.baseFontPx).toBe(20);
    expect(config.revision).toBe(1);
    expect(history[1]).toEqual({ revision: 1, at: FIXED_TIME, meta: AGENT, config });
  });

  it("applyTemplate trece prin poartă, schimbă șablonul și meniul presupus de el", () => {
    const store = newStore();
    expect(store.getState().applyTemplate("sidebar-feed", AGENT)).toEqual({ ok: true, revision: 1, applied: 2 });
    expect(store.getState().config).toMatchObject({ template: "sidebar-feed", nav: { position: "left" } });
    store.getState().applyTemplate("simple-tiles", AGENT);
    expect(store.getState().config).toMatchObject({ template: "simple-tiles", nav: { position: "left" } });
    expect(store.getState().config.modules).toEqual(DEFAULT_CONFIG.modules);
  });

  it("undo repune conținutul vechi ca revizie nouă", () => {
    const store = newStore();
    store.getState().applyPatch(setFont(20), AGENT);
    store.getState().applyPatch(setFont(24), AGENT);
    const result = store.getState().undo(0);
    expect(result).toEqual({ ok: true, revision: 3, applied: 0 });
    const { config, history } = store.getState();
    expect(config).toEqual({ ...DEFAULT_CONFIG, revision: 3 });
    expect(history.map((h) => h.revision)).toEqual([0, 1, 2, 3]);
    expect(history[3].meta).toEqual({ by: "user", reason: "Anulare" });
  });

  it("undo la o revizie inexistentă e refuzat", () => {
    const store = newStore();
    expect(store.getState().undo(7)).toMatchObject({ ok: false, violations: [{ rule: "invalid-path" }] });
    expect(store.getState().config.revision).toBe(0);
  });

  it("undo la o revizie care încalcă pragurile de acum e refuzat", () => {
    const store = newStore();
    store.getState().applyPatch(setFont(20), AGENT);
    store.getState().setThresholds({ ...NORMAL_THRESHOLDS, minFontPx: 20 });
    expect(store.getState().undo(0)).toMatchObject({ ok: false, violations: [{ rule: "min-font", limit: 20 }] });
  });

  it("setThresholds schimbă pragul pentru patch-urile următoare", () => {
    const store = newStore();
    store.getState().setThresholds(HIGH_CONTRAST_THRESHOLDS);
    const result = store.getState().applyPatch(setFont(20), AGENT);
    expect(result).toMatchObject({ ok: false, violations: [{ rule: "contrast", limit: 7 }] });
  });

  it("navigate schimbă ecranul și închide meniurile deschise", () => {
    const store = newStore();
    store.getState().openOverlay("menu.more");
    store.getState().openOverlay("menu.more");
    expect(store.getState().openOverlays).toEqual(["menu.more"]);
    store.getState().navigate("chat:ana");
    expect(store.getState()).toMatchObject({ route: "chat:ana", openOverlays: [] });
    store.getState().openOverlay("x");
    store.getState().closeOverlay("x");
    expect(store.getState().openOverlays).toEqual([]);
  });
});
