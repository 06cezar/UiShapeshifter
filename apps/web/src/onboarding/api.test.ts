import { describe, expect, it, vi } from "vitest";
import { fetchProfile, submitOnboarding } from "./api";
import { skippedResult } from "./result";

const PROFILE = { userId: "demo-fresh", onboarding: { completed: false, skipped: false } };

function respond(status: number, body: unknown) {
  return vi.fn().mockResolvedValue(new Response(JSON.stringify(body), { status }));
}

describe("fetchProfile", () => {
  it("citește profilul", async () => {
    const fetchFn = respond(200, PROFILE);
    await expect(fetchProfile("demo-fresh", fetchFn)).resolves.toEqual(PROFILE);
    expect(fetchFn).toHaveBeenCalledWith("http://localhost:8787/api/profile/demo-fresh");
  });
  it("refuză un răspuns care nu e profil", async () => {
    await expect(fetchProfile("demo-fresh", respond(200, { userId: "x" }))).rejects.toThrow("nu-l înțeleg");
  });
  it("arată eroarea serverului", async () => {
    await expect(fetchProfile("demo-fresh", respond(400, { error: "userId invalid" }))).rejects.toThrow(
      "userId invalid",
    );
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
