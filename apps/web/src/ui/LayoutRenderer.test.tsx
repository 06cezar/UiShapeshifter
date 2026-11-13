import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it } from "vitest";
import type { LayoutTemplate } from "@uishapeshifter/contracts";
import { createConfigStore } from "./config-store";
import type { ChangeMeta, ConfigStore } from "./config-store";
import { ConfigStoreProvider } from "./config-store-context";
import { LayoutRenderer } from "./LayoutRenderer";
import { fakeContrast, NORMAL_THRESHOLDS } from "./test-fixtures";

const USER: ChangeMeta = { by: "user", reason: "test" };
const TEMPLATES: LayoutTemplate[] = ["sidebar-feed", "bottom-nav-stories", "simple-tiles"];

let cleanup: (() => void) | null = null;
afterEach(() => {
  cleanup?.();
  cleanup = null;
});

async function render(template: LayoutTemplate): Promise<{ store: ConfigStore; container: HTMLElement }> {
  const store = createConfigStore({ contrastRatio: fakeContrast(), thresholds: NORMAL_THRESHOLDS });
  store.getState().applyTemplate(template, USER);
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  await act(async () =>
    root.render(
      <ConfigStoreProvider store={store}>
        <LayoutRenderer />
      </ConfigStoreProvider>,
    ),
  );
  cleanup = () => {
    act(() => root.unmount());
    container.remove();
  };
  return { store, container };
}

function agentIds(container: HTMLElement, prefix: string): string[] {
  return [...container.querySelectorAll<HTMLElement>(`[data-agent-id^="${prefix}"]`)].map((e) => e.dataset.agentId!);
}

async function click(container: HTMLElement, agentId: string) {
  const el = container.querySelector<HTMLElement>(`[data-agent-id="${agentId}"]`);
  if (!el) throw new Error(`lipsește ${agentId}`);
  await act(async () => el.click());
}

describe("LayoutRenderer", () => {
  it.each(TEMPLATES)("%s se randează din config", async (template) => {
    const { container } = await render(template);
    expect(container.querySelector(".ui-app")?.getAttribute("data-template")).toBe(template);
  });

  it("sidebar-feed: meniu cu etichete (Acasă + nav.items) și plăcile tuturor modulelor vizibile", async () => {
    const { container } = await render("sidebar-feed");
    expect(agentIds(container, "nav.")).toEqual([
      "nav.home",
      "nav.messages",
      "nav.photos",
      "nav.contacts",
      "nav.calls",
      "nav.settings",
    ]);
    expect(container.querySelector(".ui-nav-label")?.textContent).toBe("Acasă");
    expect(agentIds(container, "home.")).toEqual([
      "home.stories",
      "home.messages",
      "home.photos",
      "home.contacts",
      "home.calls",
      "home.feed",
      "home.settings",
    ]);
  });

  it("bottom-nav-stories: banda de povești sus, apoi modulele, meniul la final", async () => {
    const { container } = await render("bottom-nav-stories");
    expect(agentIds(container, "home.")[0]).toBe("home.stories");
    expect(container.querySelector(".ui-stories [data-agent-id='home.stories']")).not.toBeNull();
    const app = container.querySelector(".ui-app")!;
    expect(app.lastElementChild?.tagName).toBe("NAV");
  });

  it("simple-tiles: fără meniu, plăci pentru toate modulele vizibile", async () => {
    const { container } = await render("simple-tiles");
    expect(agentIds(container, "nav.")).toEqual([]);
    expect(container.querySelector("nav")).toBeNull();
    expect(container.querySelector(".ui-tile-grid")?.children).toHaveLength(7);
  });

  it("un modul ascuns dispare din meniu și de pe ecranul principal", async () => {
    const { store, container } = await render("sidebar-feed");
    await act(async () =>
      store.getState().applyPatch([{ op: "replace", path: "/modules/@photos/visible", value: false }], USER),
    );
    expect(agentIds(container, "nav.")).not.toContain("nav.photos");
    expect(agentIds(container, "home.")).not.toContain("home.photos");
  });

  it("ordinea plăcilor urmează order", async () => {
    const { store, container } = await render("sidebar-feed");
    await act(async () =>
      store.getState().applyPatch([{ op: "replace", path: "/modules/@settings/order", value: -1 }], USER),
    );
    expect(agentIds(container, "home.")[0]).toBe("home.settings");
  });

  it("showLabels: false scoate etichetele, dar păstrează numele pentru cititoarele de ecran", async () => {
    const { store, container } = await render("bottom-nav-stories");
    await act(async () =>
      store.getState().applyPatch([{ op: "replace", path: "/nav/showLabels", value: false }], USER),
    );
    expect(container.querySelectorAll(".ui-nav-label")).toHaveLength(0);
    expect(container.querySelector("[data-agent-id='nav.messages']")?.getAttribute("aria-label")).toBe("Mesaje");
  });

  it("o placă deschide modulul, iar meniul îl marchează ca pagina curentă", async () => {
    const { store, container } = await render("bottom-nav-stories");
    await click(container, "home.messages");
    expect(store.getState().route).toBe("messages");
    expect(container.querySelector("h1")?.textContent).toBe("Mesaje");
    expect(container.querySelector("[data-agent-id='nav.messages']")?.getAttribute("aria-current")).toBe("page");
    await click(container, "nav.home");
    expect(store.getState().route).toBe("home");
  });

  it("simple-tiles: dintr-un modul, butonul mare nav.home duce înapoi", async () => {
    const { store, container } = await render("simple-tiles");
    await click(container, "home.photos");
    expect(container.querySelector("h1")?.textContent).toBe("Poze");
    await click(container, "nav.home");
    expect(store.getState().route).toBe("home");
    expect(container.querySelector(".ui-tile-grid")).not.toBeNull();
  });

  it("schimbarea șablonului păstrează modulele și ecranul curent", async () => {
    const { store, container } = await render("sidebar-feed");
    await click(container, "home.calls");
    await act(async () => store.getState().applyTemplate("simple-tiles", USER));
    expect(container.querySelector(".ui-app")?.getAttribute("data-template")).toBe("simple-tiles");
    expect(container.querySelector("h1")?.textContent).toBe("Apeluri");
  });

  it("fiecare element interactiv are data-agent-id", async () => {
    for (const template of TEMPLATES) {
      const { container } = await render(template);
      const unnamed = [...container.querySelectorAll("button")].filter((b) => !b.dataset.agentId);
      expect(unnamed).toEqual([]);
      cleanup?.();
      cleanup = null;
    }
  });
});
