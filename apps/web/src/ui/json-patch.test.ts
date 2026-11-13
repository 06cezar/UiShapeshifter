import { describe, expect, it } from "vitest";
import { DEFAULT_CONFIG } from "@uishapeshifter/contracts";
import type { JsonPatchOp, UIConfig } from "@uishapeshifter/contracts";
import { applyJsonPatch } from "./json-patch";

/** Rezultatul ca UIConfig, sau eșec în test dacă patch-ul a fost refuzat. */
function patchOk(ops: JsonPatchOp[], config: UIConfig = DEFAULT_CONFIG): UIConfig {
  const result = applyJsonPatch(config, ops);
  if (!result.ok) throw new Error(`patch refuzat: ${JSON.stringify(result.violations)}`);
  return result.config as UIConfig;
}

function rulesOf(ops: unknown): string[] {
  const result = applyJsonPatch(DEFAULT_CONFIG, ops as JsonPatchOp[]);
  return result.ok ? [] : result.violations.map((v) => v.rule);
}

describe("applyJsonPatch", () => {
  it("înlocuiește o valoare și lasă originalul neatins", () => {
    const before = structuredClone(DEFAULT_CONFIG);
    const after = patchOk([{ op: "replace", path: "/theme/baseFontPx", value: 20 }]);
    expect(after.theme.baseFontPx).toBe(20);
    expect(DEFAULT_CONFIG).toEqual(before);
  });

  it("aplică exemplul din specs/02 cu două operații", () => {
    const after = patchOk([
      { op: "replace", path: "/theme/baseFontPx", value: 20 },
      { op: "replace", path: "/nav/showLabels", value: true },
    ]);
    expect(after.theme.baseFontPx).toBe(20);
    expect(after.nav.showLabels).toBe(true);
  });

  it("/modules/@feed/visible și /modules/5/visible ating același modul", () => {
    const byId = patchOk([{ op: "replace", path: "/modules/@feed/visible", value: false }]);
    const byIndex = patchOk([{ op: "replace", path: "/modules/5/visible", value: false }]);
    expect(byId).toEqual(byIndex);
    expect(byId.modules[5]).toMatchObject({ id: "feed", visible: false });
  });

  it("@id se caută în config-ul de după operațiile anterioare", () => {
    const after = patchOk([
      { op: "remove", path: "/modules/0" }, // scoate „stories”, feed ajunge pe poziția 4
      { op: "replace", path: "/modules/@feed/title", value: "Familia" },
    ]);
    expect(after.modules[4]).toMatchObject({ id: "feed", title: "Familia" });
  });

  it("add pune un câmp opțional, adaugă la finalul unei liste și inserează la index", () => {
    const after = patchOk([
      { op: "add", path: "/modules/@messages/pinned", value: true },
      { op: "add", path: "/nav/items/-", value: "feed" },
      { op: "add", path: "/nav/items/0", value: "stories" },
    ]);
    expect(after.modules[1].pinned).toBe(true);
    expect(after.nav.items[0]).toBe("stories");
    expect(after.nav.items.at(-1)).toBe("feed");
  });

  it("remove scoate un modul după id", () => {
    const after = patchOk([{ op: "remove", path: "/modules/@stories" }]);
    expect(after.modules.map((m) => m.id)).not.toContain("stories");
    expect(after.modules).toHaveLength(DEFAULT_CONFIG.modules.length - 1);
  });

  it("decodează ~1 și ~0 în chei", () => {
    const after = patchOk([{ op: "add", path: "/components/a~1b~0c", value: { id: "x" } }]);
    expect(Object.keys(after.components)).toEqual(["a/b~c"]);
  });

  it("copiază valoarea primită", () => {
    const value = { componentId: "c1", moduleId: "home", position: "top" };
    const after = patchOk([{ op: "add", path: "/placements/-", value }]);
    value.position = "bottom";
    expect(after.placements[0].position).toBe("top");
  });

  it("căile care nu există întorc invalid-path", () => {
    expect(rulesOf([{ op: "replace", path: "/modules/@nope/visible", value: false }])).toEqual(["invalid-path"]);
    expect(rulesOf([{ op: "replace", path: "/modules/99/visible", value: false }])).toEqual(["invalid-path"]);
    expect(rulesOf([{ op: "replace", path: "/theme/nope", value: 1 }])).toEqual(["invalid-path"]);
    expect(rulesOf([{ op: "remove", path: "/theme/nope" }])).toEqual(["invalid-path"]);
    expect(rulesOf([{ op: "replace", path: "/theme/baseFontPx/x", value: 1 }])).toEqual(["invalid-path"]);
    expect(rulesOf([{ op: "replace", path: "/nav/items/01", value: "x" }])).toEqual(["invalid-path"]);
  });

  it("/revision și /version se refuză cu invalid-path", () => {
    expect(rulesOf([{ op: "replace", path: "/revision", value: 99 }])).toEqual(["invalid-path"]);
    expect(rulesOf([{ op: "replace", path: "/version", value: "9.9.9" }])).toEqual(["invalid-path"]);
  });

  it("căile fără / sau goale se refuză, fără excepție", () => {
    expect(rulesOf([{ op: "replace", path: "", value: {} }])).toEqual(["invalid-path"]);
    expect(rulesOf([{ op: "replace", path: "theme", value: {} }])).toEqual(["invalid-path"]);
    expect(rulesOf([{ op: "add", path: "/__proto__/x", value: 1 }])).toEqual(["invalid-path"]);
  });

  it("operațiile greșite întorc invalid-op, fără excepție", () => {
    expect(rulesOf([{ op: "move", path: "/theme/baseFontPx", from: "/x" }])).toEqual(["invalid-op"]);
    expect(rulesOf([{ op: "replace", path: "/theme/baseFontPx" }])).toEqual(["invalid-op"]);
    expect(rulesOf([null])).toEqual(["invalid-op"]);
    expect(rulesOf({ op: "replace" })).toEqual(["invalid-op"]);
  });

  it("e atomic: dacă a doua operație pică, nu se aplică nimic", () => {
    const before = structuredClone(DEFAULT_CONFIG);
    const result = applyJsonPatch(DEFAULT_CONFIG, [
      { op: "replace", path: "/theme/baseFontPx", value: 20 },
      { op: "replace", path: "/theme/nope", value: 1 },
    ]);
    expect(result.ok).toBe(false);
    expect(DEFAULT_CONFIG).toEqual(before);
  });
});
