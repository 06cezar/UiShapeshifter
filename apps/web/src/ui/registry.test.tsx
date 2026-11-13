import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AgentRegistry } from "../agent-bridge";
import { createConfigStore } from "./config-store";
import type { ConfigStore } from "./config-store";
import { createRegistry, MAX_MODEL_ELEMENTS } from "./registry";
import { RegistryProvider, useAgentElement } from "./registry-context";
import { fakeContrast, NORMAL_THRESHOLDS } from "./test-fixtures";

// happy-dom nu face layout: dreptunghiurile și mărimile de derulare le dăm noi, element cu element.
function place(el: HTMLElement, x: number, y: number, width: number, height: number) {
  el.getBoundingClientRect = () => new DOMRect(x, y, width, height);
}

function setScroll(
  el: HTMLElement,
  sizes: { scrollWidth: number; clientWidth: number; scrollHeight: number; clientHeight: number },
) {
  for (const [key, value] of Object.entries(sizes)) Object.defineProperty(el, key, { value, configurable: true });
}

function add(parent: HTMLElement, html: string): HTMLElement {
  parent.insertAdjacentHTML("beforeend", html);
  return parent.lastElementChild as HTMLElement;
}

let root: HTMLElement;
let store: ConfigStore;
let registry: AgentRegistry;

beforeEach(() => {
  root = document.createElement("div");
  root.style.backgroundColor = "#FFFFFF";
  document.body.appendChild(root);
  store = createConfigStore({ contrastRatio: fakeContrast(), thresholds: NORMAL_THRESHOLDS });
  registry = createRegistry(store, root);
  vi.stubGlobal("innerWidth", 400);
  vi.stubGlobal("innerHeight", 800);
});

afterEach(() => {
  root.remove();
  vi.unstubAllGlobals();
});

describe("registrul", () => {
  it("register / get / ids, cu scoatere la dezabonare", () => {
    const button = document.createElement("button");
    root.appendChild(button);
    const unregister = registry.register("nav.messages", button);
    expect(button.getAttribute("data-agent-id")).toBe("nav.messages");
    expect(registry.get("nav.messages")).toBe(button);
    expect(registry.ids()).toEqual(["nav.messages"]);
    unregister();
    button.remove();
    expect(registry.get("nav.messages")).toBeUndefined();
    expect(registry.ids()).toEqual([]);
  });

  it("rezerva din DOM găsește elementele cu data-agent-id neînregistrate, fără dubluri", () => {
    const a = add(root, `<button data-agent-id="home.photos">Poze</button>`);
    add(root, `<button data-agent-id="home.calls">Apeluri</button>`);
    registry.register("home.photos", a);
    expect(registry.ids()).toEqual(["home.photos", "home.calls"]);
    expect(registry.get("home.calls")?.textContent).toBe("Apeluri");
  });

  it("snapshot: forma UISnapshot, cu ruta, meniurile deschise și revizia din store", () => {
    store.getState().applyPatch([{ op: "replace", path: "/theme/baseFontPx", value: 20 }], { by: "user", reason: "t" });
    store.getState().navigate("messages");
    store.getState().openOverlay("menu.more");
    const snapshot = registry.snapshot();
    expect(snapshot).toMatchObject({
      route: "messages",
      configRevision: 1,
      viewport: { width: 400, height: 800 },
      openOverlays: ["menu.more"],
      elements: [],
    });
    expect(Date.parse(snapshot.takenAt)).not.toBeNaN();
  });

  it("măsoară un element: rol, etichetă, modul, vizibilitate, font și contrast (funcțiile lui C)", () => {
    const section = add(root, `<section data-module-id="messages"></section>`);
    const button = add(
      section,
      `<button data-agent-id="messages.send" style="font-size: 20px; font-weight: 700; color: #777777">  Trimite\n mesajul </button>`,
    );
    place(button, 10, 20, 120, 56);
    const [info] = registry.snapshot().elements;
    expect(info).toMatchObject({
      id: "messages.send",
      role: "button",
      label: "Trimite mesajul",
      moduleId: "messages",
      rect: { x: 10, y: 20, width: 120, height: 56 },
      visible: true,
      inViewport: true,
      interactive: true,
      clipped: false,
      fontPx: 20,
      fontWeight: 700,
      color: "#777777",
      background: "#FFFFFF",
    });
    expect(info.contrast).toBeCloseTo(4.478, 3);
  });

  it("meta de la useAgentElement are prioritate; navigația nu ține de un modul", () => {
    const section = add(root, `<section data-module-id="messages"></section>`);
    const tile = add(section, `<button>Ana</button>`);
    const nav = add(section, `<button>Mesaje</button>`);
    registry.register("home.ana", tile, { moduleId: "home", label: "Placa Anei", role: "link" });
    registry.register("nav.messages", nav);
    const [a, b] = registry.snapshot().elements;
    expect(a).toMatchObject({ moduleId: "home", label: "Placa Anei", role: "link" });
    expect(b.moduleId).toBeUndefined();
  });

  it("invizibil: fără mărime, display:none sau opacitate 0 pe un strămoș", () => {
    const noSize = add(root, `<button data-agent-id="a">a</button>`);
    const hidden = add(root, `<button data-agent-id="b" style="display: none">b</button>`);
    const faded = add(root, `<div style="opacity: 0"><button data-agent-id="c">c</button></div>`)
      .firstElementChild as HTMLElement;
    place(noSize, 0, 0, 0, 0);
    place(hidden, 0, 0, 50, 50);
    place(faded, 0, 0, 50, 50);
    expect(registry.snapshot().elements.map((e) => e.visible)).toEqual([false, false, false]);
  });

  it("în afara ecranului: vizibil, dar nu în viewport", () => {
    const below = add(root, `<button data-agent-id="settings.reset">Resetează</button>`);
    place(below, 0, 900, 100, 50);
    expect(registry.snapshot().elements[0]).toMatchObject({ visible: true, inViewport: false });
  });

  describe("clipped", () => {
    const over = { scrollWidth: 300, clientWidth: 200, scrollHeight: 40, clientHeight: 40 };

    it("textul care iese din cutie pe lățime sau pe înălțime e tăiat", () => {
      const wide = add(root, `<p data-agent-id="a" style="overflow: hidden">text lung</p>`);
      const tall = add(root, `<p data-agent-id="b" style="overflow: hidden">text înalt</p>`);
      setScroll(wide, over);
      setScroll(tall, { scrollWidth: 200, clientWidth: 200, scrollHeight: 90, clientHeight: 40 });
      expect(registry.snapshot().elements.map((e) => e.clipped)).toEqual([true, true]);
    });

    it("toleranța de 1px nu înseamnă text tăiat", () => {
      const almost = add(root, `<p data-agent-id="a">aproape</p>`);
      setScroll(almost, { scrollWidth: 201, clientWidth: 200, scrollHeight: 41, clientHeight: 40 });
      expect(registry.snapshot().elements[0].clipped).toBe(false);
    });

    it("o listă care derulează (overflow auto/scroll pe axa respectivă) nu e text tăiat", () => {
      const list = add(root, `<ul data-agent-id="messages.list" style="overflow-y: auto"><li>1</li><li>2</li></ul>`);
      const row = add(root, `<div data-agent-id="photos.grid" style="overflow-x: scroll">poze</div>`);
      setScroll(list, { scrollWidth: 200, clientWidth: 200, scrollHeight: 900, clientHeight: 300 });
      setScroll(row, over);
      expect(registry.snapshot().elements.map((e) => e.clipped)).toEqual([false, false]);
    });

    it("derularea pe o axă nu acoperă tăierea pe cealaltă", () => {
      const list = add(root, `<ul data-agent-id="messages.list" style="overflow-y: auto; overflow-x: hidden">x</ul>`);
      setScroll(list, { scrollWidth: 300, clientWidth: 200, scrollHeight: 900, clientHeight: 300 });
      expect(registry.snapshot().elements[0].clipped).toBe(true);
    });
  });

  it("snapshot({ moduleId }) păstrează doar modulul și navigația", () => {
    add(root, `<button data-agent-id="nav.photos">Poze</button>`);
    add(
      add(root, `<section data-module-id="messages"></section>`),
      `<button data-agent-id="messages.send">Trimite</button>`,
    );
    add(
      add(root, `<section data-module-id="photos"></section>`),
      `<button data-agent-id="photos.share">Trimite poza</button>`,
    );
    expect(registry.snapshot({ moduleId: "messages" }).elements.map((e) => e.id)).toEqual([
      "nav.photos",
      "messages.send",
    ]);
  });

  it("compactSnapshot: vizibile din modulul curent + navigația, navigația întâi, rotunjit, cel mult 80", () => {
    const home = add(root, `<section data-module-id="home"></section>`);
    for (let i = 0; i < 100; i++) place(add(home, `<p data-agent-id="home.text-${i}">t</p>`), 0, i, 10.4, 10.6);
    place(add(home, `<button data-agent-id="home.messages">Mesaje</button>`), 1.4, 2.6, 100.5, 56.2);
    place(add(root, `<button data-agent-id="nav.home">Acasă</button>`), 0, 0, 50, 50);
    const other = add(root, `<section data-module-id="photos"></section>`);
    place(add(other, `<button data-agent-id="photos.share">x</button>`), 0, 0, 50, 50);

    const compact = registry.compactSnapshot();
    expect(compact.elements).toHaveLength(MAX_MODEL_ELEMENTS);
    expect(compact.elements[0].id).toBe("nav.home");
    expect(compact.elements[1]).toMatchObject({ id: "home.messages", rect: { x: 1, y: 3, width: 101, height: 56 } });
    expect(compact.elements.map((e) => e.id)).not.toContain("photos.share");
  });

  describe("ensureVisible", () => {
    it("lipsă sau ascuns: hidden", async () => {
      expect(await registry.ensureVisible("nope")).toBe("hidden");
      const hidden = add(root, `<button data-agent-id="a" style="display: none">a</button>`);
      place(hidden, 0, 0, 10, 10);
      expect(await registry.ensureVisible("a")).toBe("hidden");
    });

    it("pe ecran: visible, fără derulare", async () => {
      const el = add(root, `<button data-agent-id="a">a</button>`);
      place(el, 0, 0, 10, 10);
      el.scrollIntoView = vi.fn();
      expect(await registry.ensureVisible("a")).toBe("visible");
      expect(el.scrollIntoView).not.toHaveBeenCalled();
    });

    it("în afara ecranului: derulează la centru și întoarce scrolled", async () => {
      const el = add(root, `<button data-agent-id="a">a</button>`);
      place(el, 0, 1200, 10, 10);
      el.scrollIntoView = vi.fn();
      expect(await registry.ensureVisible("a")).toBe("scrolled");
      expect(el.scrollIntoView).toHaveBeenCalledWith({ block: "center" });
    });
  });

  it("rectOf măsoară acum", () => {
    const el = add(root, `<button data-agent-id="a">a</button>`);
    place(el, 5, 6, 7, 8);
    expect(registry.rectOf("a")).toMatchObject({ x: 5, y: 6, width: 7, height: 8 });
    expect(registry.rectOf("nope")).toBeUndefined();
  });
});

describe("useAgentElement", () => {
  function Probe({ show }: { show: boolean }) {
    const ref = useAgentElement("messages.send", { moduleId: "messages" });
    return show ? <button ref={ref}>Trimite</button> : null;
  }

  it("înregistrează la montare și scoate la demontare", async () => {
    const container = document.createElement("div");
    root.appendChild(container);
    const reactRoot = createRoot(container);
    const render = (show: boolean) =>
      act(async () =>
        reactRoot.render(
          <RegistryProvider registry={registry}>
            <Probe show={show} />
          </RegistryProvider>,
        ),
      );
    await render(true);
    expect(registry.get("messages.send")?.textContent).toBe("Trimite");
    expect(container.querySelector("[data-agent-id='messages.send']")).not.toBeNull();
    await render(false);
    expect(registry.ids()).toEqual([]);
    act(() => reactRoot.unmount());
  });

  it("fără provider nu aruncă", async () => {
    const container = document.createElement("div");
    const reactRoot = createRoot(container);
    await act(async () => reactRoot.render(<Probe show />));
    expect(container.querySelector("button")).not.toBeNull();
    act(() => reactRoot.unmount());
  });
});
