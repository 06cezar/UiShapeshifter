// „Nu schimba acest site”: lista de site-uri excluse din stocarea extensiei.

import { describe, expect, test } from "vitest";
import { EXCLUDED_SITES_KEY, excludedFrom, isExcluded, toggleExcluded, type ExcludedStorage } from "./excluded-sites";

function memory(initial: Record<string, unknown> = {}): ExcludedStorage & { data: Record<string, unknown> } {
  const data = { ...initial };
  return {
    data,
    get: async (key) => ({ [key]: data[key] }),
    set: async (items) => void Object.assign(data, items),
  };
}

describe("site-urile excluse", () => {
  test("un click exclude site-ul, al doilea îl readuce; celelalte rămân", async () => {
    const storage = memory({ [EXCLUDED_SITES_KEY]: ["github.com"] });
    expect(await toggleExcluded(storage, "stiri.example")).toBe(true);
    expect(await isExcluded(storage, "stiri.example")).toBe(true);
    expect(await toggleExcluded(storage, "stiri.example")).toBe(false);
    expect(await isExcluded(storage, "stiri.example")).toBe(false);
    expect(storage.data[EXCLUDED_SITES_KEY]).toEqual(["github.com"]);
  });

  test("fără listă sau cu date stricate: niciun site exclus", async () => {
    expect(await isExcluded(memory(), "github.com")).toBe(false);
    expect(excludedFrom({ [EXCLUDED_SITES_KEY]: "github.com" })).toEqual([]);
    expect(excludedFrom({ [EXCLUDED_SITES_KEY]: ["github.com", 3, null] })).toEqual(["github.com"]);
  });
});
