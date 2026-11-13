import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { OnboardingResult, UserProfile } from "@uishapeshifter/contracts";
import { Onboarding } from "./Onboarding";
import { OnboardingGate } from "./OnboardingGate";

const FRESH = { userId: "demo-fresh", onboarding: { completed: false, skipped: false } };

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

/** Un server de test: GET întoarce profilul, PUT îl întoarce actualizat și ține minte ce a primit. */
function fakeServer(profile: object = FRESH) {
  const sent: OnboardingResult[] = [];
  const fetchFn = vi.fn(async (_url: string, init?: RequestInit) => {
    if (init?.method === "PUT") {
      const result = JSON.parse(String(init.body)) as OnboardingResult;
      sent.push(result);
      return Response.json({ ...profile, onboarding: { completed: !result.skipped, skipped: result.skipped } });
    }
    return Response.json(profile);
  });
  return { fetchFn: fetchFn as unknown as typeof fetch, sent };
}

function byId(id: string): HTMLElement {
  const el = container.querySelector<HTMLElement>(`[data-agent-id="${id}"]`);
  if (!el) throw new Error(`lipsește ${id}; ecranul: ${container.textContent}`);
  return el;
}

async function click(id: string) {
  await act(async () => byId(id).click());
}

describe("Onboarding", () => {
  it("„Omite” e pe fiecare ecran și trimite skipped", async () => {
    const { fetchFn, sent } = fakeServer();
    const onDone = vi.fn();
    await act(async () => root.render(<Onboarding userId="demo-fresh" onDone={onDone} fetchFn={fetchFn} />));

    for (const next of ["onboarding.next", "onboarding.font.20", "onboarding.contrast.high"]) {
      expect(byId("onboarding.skip").textContent).toBe("Omite");
      await click(next);
    }
    expect(byId("onboarding.skip")).toBeTruthy(); // și la testul de atingere
    await click("onboarding.skip");

    expect(sent).toEqual([{ skipped: true, answers: [] }]);
    expect(onDone).toHaveBeenCalledWith(expect.objectContaining({ onboarding: { completed: false, skipped: true } }));
  });

  it("parcurs cap-coadă, trimite profilul Mariei", async () => {
    const { fetchFn, sent } = fakeServer();
    const onDone = vi.fn();
    await act(async () => root.render(<Onboarding userId="demo-fresh" onDone={onDone} fetchFn={fetchFn} />));

    await click("onboarding.next");
    await click("onboarding.font.20");
    await click("onboarding.contrast.high");

    // atingere: 72, 64, 56 din prima; la 48 trei ratări; 40 din prima (nu contează, după o ratare)
    await click("onboarding.touch.target");
    await click("onboarding.touch.target");
    await click("onboarding.touch.target");
    for (let i = 0; i < 3; i++) {
      await act(async () => {
        byId("onboarding.touch.area").dispatchEvent(new PointerEvent("pointerdown", { bubbles: true }));
      });
    }
    await click("onboarding.touch.target");

    await click("onboarding.task.messages");
    await click("onboarding.task.photos");
    expect(byId("onboarding.task.photos").getAttribute("aria-pressed")).toBe("true");
    await click("onboarding.next");
    await click("onboarding.layout.simple-tiles");
    await click("onboarding.nav.bottom");
    await click("onboarding.voice.yes");

    expect(container.textContent).toContain(
      "Am pregătit aplicația așa: text de 20px, contrast mare, butoane mari, meniul jos, îmi poți vorbi.",
    );
    await click("onboarding.finish");

    expect(sent).toHaveLength(1);
    expect(sent[0]).toMatchObject({
      skipped: false,
      needs: { minFontPx: 20, contrast: "high", minTargetPx: 56, prefersVoice: true },
      preferences: { pinnedModules: ["messages", "photos"], template: "simple-tiles", navPosition: "bottom" },
      persona: { frequentTasks: ["messages", "photos"] },
    });
    expect(onDone).toHaveBeenCalledTimes(1);
  });

  it("„Înapoi” revine la pasul anterior", async () => {
    const { fetchFn } = fakeServer();
    await act(async () => root.render(<Onboarding userId="demo-fresh" onDone={vi.fn()} fetchFn={fetchFn} />));
    await click("onboarding.next");
    await click("onboarding.font.24");
    await click("onboarding.back");
    expect(byId("onboarding.font.24").getAttribute("aria-pressed")).toBe("true");
  });

  it("dacă serverul nu răspunde, omul poate intra fără să salveze", async () => {
    const fetchFn = vi.fn().mockRejectedValue(new Error("Serverul nu răspunde.")) as unknown as typeof fetch;
    const onDone = vi.fn();
    await act(async () => root.render(<Onboarding userId="demo-fresh" onDone={onDone} fetchFn={fetchFn} />));
    await click("onboarding.skip");
    expect(container.querySelector('[role="alert"]')?.textContent).toContain("Serverul nu răspunde.");
    await act(async () =>
      [...container.querySelectorAll("button")].find((b) => b.textContent === "Intră fără să salvez")?.click(),
    );
    expect(onDone).toHaveBeenCalledWith(null);
  });

  it("opțiunile de font au etichete pentru cititorul de ecran", async () => {
    const { fetchFn } = fakeServer();
    await act(async () => root.render(<Onboarding userId="demo-fresh" onDone={vi.fn()} fetchFn={fetchFn} />));
    await click("onboarding.next");
    expect(byId("onboarding.font.20").getAttribute("aria-label")).toBe("Textul de 20 pixeli");
    expect(document.activeElement?.textContent).toBe("Ce mărime de text îți place?");
  });
});

describe("OnboardingGate", () => {
  const APP = <p data-agent-id="home.messages">Aplicația</p>;

  it("profil nou: arată testul", async () => {
    const { fetchFn } = fakeServer();
    await act(async () =>
      root.render(
        <OnboardingGate userId="demo-fresh" fetchFn={fetchFn}>
          {APP}
        </OnboardingGate>,
      ),
    );
    expect(byId("onboarding.skip")).toBeTruthy();
    expect(container.textContent).not.toContain("Aplicația");
  });

  it("profil cu testul făcut: arată aplicația și dă profilul mai departe", async () => {
    const done = { ...FRESH, userId: "maria", onboarding: { completed: true, skipped: false } };
    const { fetchFn } = fakeServer(done);
    const onProfile = vi.fn<(p: UserProfile) => void>();
    await act(async () =>
      root.render(
        <OnboardingGate userId="maria" fetchFn={fetchFn} onProfile={onProfile}>
          {APP}
        </OnboardingGate>,
      ),
    );
    expect(container.textContent).toBe("Aplicația");
    expect(onProfile).toHaveBeenCalledWith(done);
  });

  it("după „Omite” intră în aplicație", async () => {
    const { fetchFn } = fakeServer();
    await act(async () =>
      root.render(
        <OnboardingGate userId="demo-fresh" fetchFn={fetchFn}>
          {APP}
        </OnboardingGate>,
      ),
    );
    await click("onboarding.skip");
    expect(container.textContent).toBe("Aplicația");
  });

  it("serverul oprit nu blochează aplicația", async () => {
    const fetchFn = vi.fn().mockRejectedValue(new Error("oprit")) as unknown as typeof fetch;
    await act(async () =>
      root.render(
        <OnboardingGate userId="demo-fresh" fetchFn={fetchFn}>
          {APP}
        </OnboardingGate>,
      ),
    );
    expect(container.textContent).toBe("Aplicația");
  });
});
