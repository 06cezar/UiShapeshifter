import { describe, expect, it, vi } from "vitest";
import { fetchProfile, isProfile, submitOnboarding } from "./api";
import { skippedResult } from "./result";
import { testProfile } from "./test-fixtures";

const PROFILE = testProfile();

function respond(status: number, body: unknown) {
  return vi.fn().mockResolvedValue(new Response(JSON.stringify(body), { status }));
}

describe("fetchProfile", () => {
  it("citește profilul, cu o limită de timp", async () => {
    const fetchFn = respond(200, PROFILE);
    await expect(fetchProfile("demo-fresh", fetchFn)).resolves.toEqual(PROFILE);
    const [url, init] = fetchFn.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("http://localhost:8787/api/profile/demo-fresh");
    expect(init.signal).toBeInstanceOf(AbortSignal);
  });
  it("un server care nu răspunde e abandonat după limita de timp", async () => {
    const hanging = vi.fn(
      (_url: string, init?: RequestInit) =>
        new Promise<Response>((_resolve, reject) =>
          init?.signal?.addEventListener("abort", () => reject(init.signal?.reason)),
        ),
    ) as unknown as typeof fetch;
    await expect(fetchProfile("demo-fresh", hanging, 20)).rejects.toThrow();
  });
  it("refuză un răspuns care nu e profil", async () => {
    await expect(fetchProfile("demo-fresh", respond(200, { userId: "x" }))).rejects.toThrow("forma UserProfile");
  });
  it("păstrează eroarea serverului pentru consolă", async () => {
    await expect(fetchProfile("demo-fresh", respond(400, { error: "userId invalid" }))).rejects.toThrow(
      "userId invalid",
    );
  });
});

describe("isProfile", () => {
  it("verifică și nevoile, nu doar onboarding-ul", () => {
    expect(isProfile(PROFILE)).toBe(true);
    expect(isProfile({ userId: "x", displayName: "X", onboarding: { completed: false, skipped: false } })).toBe(false);
    expect(isProfile({ ...PROFILE, needs: { ...PROFILE.needs, minFontPx: "20" } })).toBe(false);
    expect(isProfile({ ...PROFILE, needs: { ...PROFILE.needs, contrast: "mare" } })).toBe(false);
    expect(isProfile({ ...PROFILE, facts: undefined })).toBe(false);
  });
});

describe("submitOnboarding", () => {
  it("trimite rezultatul cu PUT, ca JSON", async () => {
    const fetchFn = respond(200, { ...PROFILE, onboarding: { completed: false, skipped: true } });
    const profile = await submitOnboarding("demo-fresh", skippedResult(), fetchFn);
    expect(profile.onboarding.skipped).toBe(true);
    const [url, init] = fetchFn.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("http://localhost:8787/api/profile/demo-fresh/onboarding");
    expect(init.method).toBe("PUT");
    expect(JSON.parse(String(init.body))).toEqual({ skipped: true, answers: [] });
  });
});
