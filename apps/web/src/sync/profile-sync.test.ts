// Profilul local (E8): adus de pe server, păstrat fără server, trimis înapoi dacă serverul l-a pierdut.

import { describe, expect, test } from "vitest";
import type { UserProfile } from "@uishapeshifter/contracts";
import { isBlank, readLocalProfile, syncProfile, type ProfileStorage } from "./profile-sync";

const USER = "u-test1234";
const API = "http://server/api";

function profile(overrides: Partial<UserProfile> = {}): UserProfile {
  return {
    userId: USER,
    displayName: USER,
    createdAt: "2026-11-13T20:00:00.000Z",
    updatedAt: "2026-11-13T20:00:00.000Z",
    onboarding: { completed: false, skipped: false },
    needs: { minFontPx: 16, contrast: "normal", minTargetPx: 44, reducedMotion: false, prefersVoice: false },
    preferences: { familiarLayouts: [], hiddenModules: [], pinnedModules: [] },
    persona: { techComfort: "medium", goals: [], frequentTasks: [], keyContacts: [], painPoints: [] },
    facts: [],
    trust: { accepted: 0, undone: 0, autoApplyLowRisk: false },
    generalPreferences: [],
    familiarSites: [],
    ...overrides,
  };
}

const learned = profile({
  needs: { minFontPx: 22, contrast: "high", minTargetPx: 56, reducedMotion: false, prefersVoice: false },
  generalPreferences: [
    {
      id: "ai-features",
      category: "ai-features",
      text: "fără rezumate AI",
      source: "onboarding",
      evidence: [],
      createdAt: "2026-11-13T20:00:00.000Z",
      appliedOn: [],
    },
  ],
});

function memory(initial: Record<string, unknown> = {}): ProfileStorage & { data: Record<string, unknown> } {
  const data = { ...initial };
  return {
    data,
    get: async (keys) => Object.fromEntries([keys].flat().map((k) => [k, data[k]])),
    set: async (items) => void Object.assign(data, items),
  };
}

/** Un server fals: GET întoarce `remote`, PUT îl înlocuiește și îl întoarce. */
function server(remote: UserProfile | null) {
  const calls: string[] = [];
  let stored = remote;
  const fetchFn = (async (_url: string, init?: RequestInit) => {
    calls.push(init?.method ?? "GET");
    if (init?.method === "PUT") stored = JSON.parse(String(init.body)) as UserProfile;
    if (!stored) return new Response("{}", { status: 500 });
    return new Response(JSON.stringify(stored), { status: 200 });
  }) as typeof fetch;
  return { fetchFn, calls, stored: () => stored };
}

describe("sincronizarea profilului", () => {
  test("aduce profilul de pe server și îl ține local, sub userId", async () => {
    const storage = memory();
    const { fetchFn } = server(learned);
    expect(await syncProfile({ apiUrl: API, userId: USER, storage, fetchFn })).toBe("pulled");
    expect((await readLocalProfile(storage, USER))?.needs.minFontPx).toBe(22);
  });

  test("fără server, copia locală rămâne (rezistă la repornirea browserului fără cont)", async () => {
    const storage = memory({ [USER]: learned });
    const fetchFn = (async () => {
      throw new TypeError("Failed to fetch");
    }) as typeof fetch;
    expect(await syncProfile({ apiUrl: API, userId: USER, storage, fetchFn })).toBe("offline");
    expect((await readLocalProfile(storage, USER))?.generalPreferences?.[0]?.text).toBe("fără rezumate AI");
  });

  test("serverul a pornit de la zero: îi trimitem înapoi profilul local", async () => {
    const storage = memory({ [USER]: learned });
    const remote = server(profile());
    expect(await syncProfile({ apiUrl: API, userId: USER, storage, fetchFn: remote.fetchFn })).toBe("restored");
    expect(remote.calls).toEqual(["GET", "PUT"]);
    expect(remote.stored()?.needs.minFontPx).toBe(22);
  });

  test("un profil gol nu suprascrie unul gol: doar îl aducem", async () => {
    const storage = memory({ [USER]: profile() });
    const remote = server(profile());
    expect(await syncProfile({ apiUrl: API, userId: USER, storage, fetchFn: remote.fetchFn })).toBe("pulled");
    expect(remote.calls).toEqual(["GET"]);
  });

  test("ce nu seamănă a profil (alt userId, gunoi) nu intră în stocare", async () => {
    const storage = memory();
    const remote = server({ ...learned, userId: "altcineva" });
    expect(await syncProfile({ apiUrl: API, userId: USER, storage, fetchFn: remote.fetchFn })).toBe("offline");
    expect(storage.data[USER]).toBeUndefined();
    expect(isBlank(profile())).toBe(true);
    expect(isBlank(learned)).toBe(false);
  });
});
