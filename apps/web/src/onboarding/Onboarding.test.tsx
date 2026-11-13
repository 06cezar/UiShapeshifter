import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { OnboardingResult, UserProfile } from "@uishapeshifter/contracts";
import { Onboarding, type OnboardingProps } from "./Onboarding";
import { OnboardingGate } from "./OnboardingGate";
import { testProfile } from "./test-fixtures";

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  vi.spyOn(console, "error").mockImplementation(() => {}); // erorile de salvare merg intenționat în consolă
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  vi.restoreAllMocks();
});

/** Un server de test: GET întoarce profilul, PUT îl întoarce actualizat și ține minte ce a primit. */
function fakeServer(profile: UserProfile = testProfile()) {
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

/** Fără pauza de după schimbarea pasului, ca testele să poată apăsa repede; pauza are testul ei. */
async function renderOnboarding(props: Partial<OnboardingProps> & Pick<OnboardingProps, "fetchFn">) {
  await act(async () => root.render(<Onboarding userId="demo-fresh" onDone={vi.fn()} inputGuardMs={0} {...props} />));
}

function byId(id: string): HTMLElement {
  const el = container.querySelector<HTMLElement>(`[data-agent-id="${id}"]`);
  if (!el) throw new Error(`lipsește ${id}; ecranul: ${container.textContent}`);
  return el;
}

function buttonByText(text: string): HTMLButtonElement {
  const button = [...container.querySelectorAll("button")].find((b) => b.textContent === text);
  if (!button) throw new Error(`lipsește butonul „${text}”`);
  return button;
}

async function click(id: string) {
  await act(async () => byId(id).click());
}

/** Apăsare cu degetul pe țintă: pointerdown, apoi click (cum face browserul). */
async function tap(id: string) {
  await act(async () => {
    byId(id).dispatchEvent(new PointerEvent("pointerdown", { bubbles: true }));
    byId(id).click();
  });
}

async function missTouchArea() {
  await act(async () => {
    byId("onboarding.touch.area").dispatchEvent(new PointerEvent("pointerdown", { bubbles: true }));
  });
}

describe("Onboarding", () => {
  it("„Omite” e pe fiecare ecran și trimite skipped", async () => {
    const { fetchFn, sent } = fakeServer();
    const onDone = vi.fn();
    await renderOnboarding({ fetchFn, onDone });

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
    await renderOnboarding({ fetchFn, onDone });

    await click("onboarding.next");
    await click("onboarding.font.20");
    await click("onboarding.contrast.high");

    // atingere: 72, 64, 56 din prima; la 48 trei ratări; 40 din prima (nu contează, după o ratare)
    await tap("onboarding.touch.target");
    await tap("onboarding.touch.target");
    await tap("onboarding.touch.target");
    for (let i = 0; i < 3; i++) await missTouchArea();
    await tap("onboarding.touch.target");

    await click("onboarding.task.messages");
    await click("onboarding.task.photos");
    expect(byId("onboarding.task.photos").getAttribute("aria-pressed")).toBe("true");
    await click("onboarding.next");
    await click("onboarding.layout.simple-tiles");
    expect(byId("onboarding.nav.bottom").textContent).toBe("Jos");
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
      persona: { frequentTasks: ["sendMessage", "sendPhoto"] },
    });
    expect(sent[0].answers).toContainEqual({ questionId: "touch.48.misses", answer: 3 });
    expect(onDone).toHaveBeenCalledTimes(1);
  });

  it("testul de atingere făcut cu tastatura nu decide mărimea țintelor", async () => {
    const { fetchFn, sent } = fakeServer();
    await renderOnboarding({ fetchFn });
    await click("onboarding.next");
    await click("onboarding.font.20");
    await click("onboarding.contrast.normal");
    for (let i = 0; i < 5; i++) await click("onboarding.touch.target"); // Enter: click fără pointerdown
    for (const id of ["onboarding.next", "onboarding.layout.simple-tiles", "onboarding.nav.bottom"]) await click(id);
    await click("onboarding.voice.no");
    await click("onboarding.finish");
    expect(sent[0].needs).not.toHaveProperty("minTargetPx");
    expect(sent[0].answers).toContainEqual({ questionId: "touch.72.input", answer: "keyboard" });
  });

  it("dublu-click: al doilea click nu răspunde la întrebarea următoare", async () => {
    let now = 1000;
    vi.spyOn(performance, "now").mockImplementation(() => now);
    const { fetchFn } = fakeServer();
    await renderOnboarding({ fetchFn, inputGuardMs: 400 });

    now += 500;
    await click("onboarding.next"); // pasul 2 (font) apare la momentul `now`
    now += 500;
    await click("onboarding.font.20"); // pasul 3 (contrast) apare acum
    now += 100; // al doilea click al dublu-click-ului
    await click("onboarding.contrast.high");
    expect(byId("onboarding.contrast.high").getAttribute("aria-pressed")).toBe("false");
    expect(container.textContent).toContain("Ce se vede mai bine?");

    now += 400; // după pauză, click-ul contează
    await click("onboarding.contrast.high");
    expect(container.textContent).toContain("Cât de mari să fie butoanele?");
  });

  it("serverul oprit: mesaj în română, fără textul tehnic", async () => {
    const fetchFn = vi.fn().mockRejectedValue(new TypeError("Failed to fetch")) as unknown as typeof fetch;
    const onDone = vi.fn();
    await renderOnboarding({ fetchFn, onDone });
    await click("onboarding.skip");
    const alert = container.querySelector('[role="alert"]')?.textContent ?? "";
    expect(alert).toContain("Nu am putut salva răspunsurile.");
    expect(alert).not.toContain("Failed to fetch");
    await act(async () => buttonByText("Intră fără să salvez").click());
    expect(onDone).toHaveBeenCalledWith(null);
  });

  it("după un „Omite” eșuat, eroarea dispare la pasul următor și „Gata” trimite răspunsurile, nu skipped", async () => {
    const { fetchFn: working, sent } = fakeServer();
    let online = false;
    const fetchFn = vi.fn((url: string, init?: RequestInit) =>
      online ? working(url, init) : Promise.reject(new TypeError("Failed to fetch")),
    ) as unknown as typeof fetch;
    await renderOnboarding({ fetchFn });

    await click("onboarding.skip");
    expect(container.querySelector('[role="alert"]')).not.toBeNull();
    await click("onboarding.next");
    expect(container.querySelector('[role="alert"]')).toBeNull();

    online = true;
    await click("onboarding.font.24");
    await click("onboarding.back"); // contrast → font
    await click("onboarding.back"); // font → bun venit
    expect(container.textContent).toContain("Bun venit");
    for (const id of ["onboarding.next", "onboarding.font.24", "onboarding.contrast.normal"]) await click(id);
    for (let i = 0; i < 5; i++) await tap("onboarding.touch.target");
    for (const id of [
      "onboarding.next",
      "onboarding.layout.sidebar-feed",
      "onboarding.nav.left",
      "onboarding.voice.no",
    ]) {
      await click(id);
    }
    await click("onboarding.finish");
    expect(sent).toHaveLength(1);
    expect(sent[0]).toMatchObject({ skipped: false, needs: { minFontPx: 24 } });
  });

  it("„Înapoi” revine la pasul anterior", async () => {
    const { fetchFn } = fakeServer();
    await renderOnboarding({ fetchFn });
    await click("onboarding.next");
    await click("onboarding.font.24");
    await click("onboarding.back");
    expect(byId("onboarding.font.24").getAttribute("aria-pressed")).toBe("true");
  });

  it("își pune singur tema: variabilele CSS există fără store pe :root", async () => {
    const { fetchFn } = fakeServer();
    await renderOnboarding({ fetchFn });
    const style = container.querySelector<HTMLElement>(".onboarding")?.style;
    expect(style?.getPropertyValue("--spacing")).toBe("8px");
    expect(style?.getPropertyValue("--color-text")).toBe("#111827");
    expect(style?.getPropertyValue("--color-focus")).toBe("#1D4ED8");
    expect(style?.getPropertyValue("--onboarding-font")).toBe("20px");
  });

  it("opțiunile de font au etichete pentru cititorul de ecran", async () => {
    const { fetchFn } = fakeServer();
    await renderOnboarding({ fetchFn });
    await click("onboarding.next");
    expect(byId("onboarding.font.20").getAttribute("aria-label")).toBe("Textul de 20 pixeli");
    expect(document.activeElement?.textContent).toBe("Ce mărime de text îți place?");
  });
});

describe("OnboardingGate", () => {
  const APP = <p data-agent-id="home.messages">Aplicația</p>;

  it("cât se citește profilul: „Se încarcă…”, anunțat", async () => {
    const pending = vi.fn(() => new Promise<Response>(() => {})) as unknown as typeof fetch;
    await act(async () =>
      root.render(
        <OnboardingGate userId="demo-fresh" fetchFn={pending}>
          {APP}
        </OnboardingGate>,
      ),
    );
    expect(container.querySelector('[role="status"]')?.textContent).toBe("Se încarcă…");
  });

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
    const done = testProfile({ userId: "maria", onboarding: { completed: true, skipped: false } });
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
