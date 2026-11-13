import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_CONFIG, DEFAULT_PROFILE_NEEDS } from "@uishapeshifter/contracts";
import type { UIConfig, UserNeeds } from "@uishapeshifter/contracts";
import { loadInitialConfig, SAVE_DEBOUNCE_MS, startConfigSaver, userIdFromSearch } from "./config-persistence";
import { createConfigStore } from "./config-store";
import type { ChangeMeta } from "./config-store";
import { fakeContrast, NORMAL_THRESHOLDS } from "./test-fixtures";

const API = "http://server/api";
const USER: ChangeMeta = { by: "user", reason: "test" };
const MARIA_NEEDS: UserNeeds = {
  minFontPx: 20,
  contrast: "high",
  minTargetPx: 56,
  reducedMotion: false,
  prefersVoice: true,
};
const SAVED: UIConfig = { ...structuredClone(DEFAULT_CONFIG), revision: 7, template: "simple-tiles" };

/** Serverul fals: răspunsuri după URL; ce nu e în tabel e 404, ca ruta lipsă din main. */
function fakeServer(routes: Record<string, unknown>) {
  return vi.fn(async (url: string) =>
    url in routes
      ? new Response(JSON.stringify(routes[url]), { status: 200 })
      : new Response(JSON.stringify({ error: "Ruta nu există" }), { status: 404 }),
  );
}

/** Ajustarea falsă: marchează config-ul ca să vedem că a trecut pe acolo și cu ce nevoi. */
const markAdjust = vi.fn((config: UIConfig, needs: UserNeeds) => ({ ...config, minTargetPx: needs.minTargetPx }));

describe("userIdFromSearch", () => {
  it("maria implicit, demo-fresh din ?user=, id-urile nesigure ignorate", () => {
    expect(userIdFromSearch("")).toBe("maria");
    expect(userIdFromSearch("?user=demo-fresh")).toBe("demo-fresh");
    expect(userIdFromSearch("?user=../etc")).toBe("maria");
  });
});

describe("loadInitialConfig", () => {
  it("folosește config-ul salvat și nevoile din profil, apoi ajustează", async () => {
    const fetchFn = fakeServer({ [`${API}/config/maria`]: SAVED, [`${API}/profile/maria`]: { needs: MARIA_NEEDS } });
    const result = await loadInitialConfig("maria", { apiUrl: API, adjust: markAdjust, fetchFn });
    expect(result.source).toEqual({ config: "server", needs: "server" });
    expect(result.needs).toEqual(MARIA_NEEDS);
    expect(result.config).toMatchObject({ revision: 7, template: "simple-tiles", minTargetPx: 56 });
  });

  it("fără rute (404) cade pe DEFAULT_CONFIG și DEFAULT_PROFILE_NEEDS, tot ajustate", async () => {
    const result = await loadInitialConfig("maria", { apiUrl: API, adjust: markAdjust, fetchFn: fakeServer({}) });
    expect(result.source).toEqual({ config: "default", needs: "default" });
    expect(result.needs).toEqual(DEFAULT_PROFILE_NEEDS);
    expect(result.config).toEqual({ ...DEFAULT_CONFIG, minTargetPx: DEFAULT_PROFILE_NEEDS.minTargetPx });
  });

  it("fără server (eroare de rețea) pornește la fel, fără excepție", async () => {
    const fetchFn = vi.fn(async () => {
      throw new TypeError("Failed to fetch");
    });
    const result = await loadInitialConfig("maria", { apiUrl: API, adjust: markAdjust, fetchFn });
    expect(result.source).toEqual({ config: "default", needs: "default" });
  });

  it("un config salvat cu formă greșită sau un profil fără needs valide se ignoră", async () => {
    const fetchFn = fakeServer({
      [`${API}/config/maria`]: { ...SAVED, template: "grid" },
      [`${API}/profile/maria`]: { needs: { minFontPx: "mare" } },
    });
    const result = await loadInitialConfig("maria", { apiUrl: API, adjust: markAdjust, fetchFn });
    expect(result.source).toEqual({ config: "default", needs: "default" });
  });

  it("un config salvat cu altă version decât CONTRACT_VERSION se ignoră: pornim de la DEFAULT_CONFIG", async () => {
    const fetchFn = fakeServer({ [`${API}/config/maria`]: { ...SAVED, version: "0.9.0" } });
    const result = await loadInitialConfig("maria", { apiUrl: API, adjust: markAdjust, fetchFn });
    expect(result.source.config).toBe("default");
    expect(result.config).toMatchObject({
      version: DEFAULT_CONFIG.version,
      revision: 0,
      template: DEFAULT_CONFIG.template,
    });
  });

  it("cere exact rutele din specs/06", async () => {
    const fetchFn = fakeServer({});
    await loadInitialConfig("demo-fresh", { apiUrl: API, adjust: markAdjust, fetchFn });
    expect(fetchFn.mock.calls.map((c) => c[0]).sort()).toEqual([
      `${API}/config/demo-fresh`,
      `${API}/profile/demo-fresh`,
    ]);
  });
});

describe("startConfigSaver", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  function setup(fetchFn = vi.fn(async () => new Response(JSON.stringify({ revision: 0 }), { status: 200 }))) {
    const store = createConfigStore({ contrastRatio: fakeContrast(), thresholds: NORMAL_THRESHOLDS });
    const onError = vi.fn();
    const stop = startConfigSaver(store, "maria", { apiUrl: API, fetchFn, onError });
    return { store, fetchFn, onError, stop };
  }

  const setFont = (value: number) => [{ op: "replace" as const, path: "/theme/baseFontPx", value }];

  it("3 schimbări sub o secundă dau un singur PUT, cu ultima revizie", async () => {
    const { store, fetchFn } = setup();
    for (const value of [18, 20, 22]) {
      store.getState().applyPatch(setFont(value), USER);
      await vi.advanceTimersByTimeAsync(SAVE_DEBOUNCE_MS / 4);
    }
    expect(fetchFn).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(SAVE_DEBOUNCE_MS);
    expect(fetchFn).toHaveBeenCalledTimes(1);
    const [url, init] = fetchFn.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe(`${API}/config/maria`);
    expect(init.method).toBe("PUT");
    expect(JSON.parse(String(init.body))).toMatchObject({ revision: 3, theme: { baseFontPx: 22 } });
  });

  it("navigarea nu salvează nimic", async () => {
    const { store, fetchFn } = setup();
    store.getState().navigate("messages");
    await vi.advanceTimersByTimeAsync(SAVE_DEBOUNCE_MS * 2);
    expect(fetchFn).not.toHaveBeenCalled();
  });

  it("un PUT respins sau un 404 nu aruncă: se raportează și interfața merge mai departe", async () => {
    const failing = vi.fn(async () => {
      throw new TypeError("Failed to fetch");
    });
    const { store, onError } = setup(failing);
    store.getState().applyPatch(setFont(20), USER);
    await vi.advanceTimersByTimeAsync(SAVE_DEBOUNCE_MS);
    expect(onError).toHaveBeenCalledTimes(1);

    const notFound = setup(vi.fn(async () => new Response("{}", { status: 404 })));
    notFound.store.getState().applyPatch(setFont(20), USER);
    await vi.advanceTimersByTimeAsync(SAVE_DEBOUNCE_MS);
    expect(notFound.onError).toHaveBeenCalledTimes(1);
  });

  it("după oprire nu mai trimite nimic, nici salvarea în așteptare", async () => {
    const { store, fetchFn, stop } = setup();
    store.getState().applyPatch(setFont(20), USER);
    stop();
    await vi.advanceTimersByTimeAsync(SAVE_DEBOUNCE_MS * 2);
    expect(fetchFn).not.toHaveBeenCalled();
  });
});
