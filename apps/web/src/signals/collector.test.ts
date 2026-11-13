// Colectorul de semnale (E2): ce se trimite, când și ce nu se trimite niciodată.
// happy-dom nu face layout: dăm elementelor o poziție prin data-x/data-y/data-w/data-h.

import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import type { UsageSignal } from "@uishapeshifter/contracts";
import { DWELL_MS, FLUSH_EVERY_MS, isHelpRequest, startSignalCollector, type SignalCollector } from "./collector";

const HOST = "uishapeshifter-root";

beforeEach(() => {
  vi.spyOn(Element.prototype, "getBoundingClientRect").mockImplementation(function (this: Element) {
    const d = (this as HTMLElement).dataset ?? {};
    const x = Number(d.x ?? 0),
      y = Number(d.y ?? 0),
      w = Number(d.w ?? 0),
      h = Number(d.h ?? 0);
    return { x, y, left: x, top: y, width: w, height: h, right: x + w, bottom: y + h, toJSON() {} } as DOMRect;
  });
});
afterEach(() => {
  vi.restoreAllMocks();
  document.body.innerHTML = "";
});

function setup(scale = () => 1) {
  let t = 0;
  const timers: { fn: () => void; at: number }[] = [];
  const batches: UsageSignal[][] = [];
  const collector: SignalCollector = startSignalCollector({
    ourHostId: HOST,
    idOf: (el) => `e.${el.id || el.tagName.toLowerCase()}`,
    regionIdOf: (el) => (el.closest("main") ? "r.main" : undefined),
    send: (batch) => batches.push(batch),
    now: () => t,
    setTimer: (fn, ms) => timers.push({ fn, at: t + ms }),
    clearTimer: () => {},
    scale,
  });
  /** Trece timpul și rulează timerele scadente, în ordine. */
  function advance(ms: number) {
    const end = t + ms;
    for (;;) {
      timers.sort((a, b) => a.at - b.at);
      const next = timers[0];
      if (!next || next.at > end) break;
      timers.shift();
      t = next.at;
      next.fn();
    }
    t = end;
  }
  const click = (target: Element, x: number, y: number) =>
    target.dispatchEvent(new MouseEvent("click", { bubbles: true, clientX: x, clientY: y }));
  const sent = () => batches.flat();
  return { collector, advance, click, sent, batches };
}

describe("click-uri", () => {
  test("pe un buton: feature_use; lângă el (≤ 24px): misclick cu elementul cel mai apropiat; departe: nimic", () => {
    document.body.innerHTML = `<main><button id="trimite" data-x="100" data-y="100" data-w="40" data-h="20">Trimite</button><p id="text">x</p></main>`;
    const { click, collector, sent } = setup();
    click(document.getElementById("trimite")!, 110, 110);
    click(document.getElementById("text")!, 150, 105); // 10px la dreapta butonului
    click(document.getElementById("text")!, 400, 400); // departe
    collector.flush();
    expect(sent()).toMatchObject([
      { kind: "feature_use", elementId: "e.trimite", action: "button" },
      { kind: "misclick", nearestElementId: "e.trimite", distancePx: 10, x: 150, y: 105 },
    ]);
    collector.stop();
  });

  test("click-urile pe interfața noastră (chat, mascotă) nu sunt semnale despre site", () => {
    document.body.innerHTML = `<div id="${HOST}"><button data-x="0" data-y="0" data-w="40" data-h="40">Chat</button></div>`;
    const { click, collector, sent } = setup();
    click(document.querySelector(`#${HOST} button`)!, 5, 5);
    collector.flush();
    expect(sent()).toEqual([]);
    collector.stop();
  });

  test("niciodată textul din câmpuri", () => {
    document.body.innerHTML = `<input id="parola" type="password" value="secret123" data-x="0" data-y="0" data-w="100" data-h="20">`;
    const { click, collector, sent } = setup();
    click(document.getElementById("parola")!, 5, 5);
    collector.flush();
    expect(JSON.stringify(sent())).not.toContain("secret123");
    collector.stop();
  });
});

describe("loturi", () => {
  test("pleacă cel mult o dată la 5 s, doar dacă e ceva de trimis", () => {
    document.body.innerHTML = `<button id="b" data-x="0" data-y="0" data-w="40" data-h="20">B</button>`;
    const { click, advance, batches, collector } = setup();
    advance(FLUSH_EVERY_MS);
    expect(batches).toHaveLength(0);
    click(document.getElementById("b")!, 5, 5);
    click(document.getElementById("b")!, 5, 5);
    advance(FLUSH_EVERY_MS);
    expect(batches).toHaveLength(1);
    expect(batches[0]).toHaveLength(2);
    collector.stop();
  });
});

describe("zoom, stat pe loc, bucle, ajutor", () => {
  test("zoom: scara față de începutul vizitei, după ce browserul a aplicat-o", () => {
    let current = 1.25; // ex. Windows la 125%: nu e zoom, e punctul de plecare
    const { advance, collector, sent } = setup(() => current);
    current = 1.25 * 1.5;
    // happy-dom nu pune ctrlKey pe WheelEvent; Ctrl + „+” trece prin aceeași citire a scării
    window.dispatchEvent(new KeyboardEvent("keydown", { ctrlKey: true, key: "+" }));
    advance(1000);
    collector.flush();
    expect(sent()).toMatchObject([{ kind: "zoom", scale: 1.5 }]);
    collector.stop();
  });

  test("dwell: ≥ 20 s fără click, o singură dată până la următorul click", () => {
    const { advance, collector, sent } = setup();
    advance(DWELL_MS + 5_000);
    advance(30_000);
    collector.flush();
    expect(sent().filter((s) => s.kind === "dwell")).toHaveLength(1);
    collector.stop();
  });

  test("back_loop: aceeași pagină de 3 ori în 60 s", () => {
    const { advance, collector, sent } = setup();
    const start = location.pathname;
    for (const path of ["/altundeva", start, "/altundeva", start]) {
      history.pushState({}, "", path);
      window.dispatchEvent(new PopStateEvent("popstate"));
      advance(1000);
    }
    collector.flush();
    expect(sent().find((s) => s.kind === "back_loop")).toMatchObject({ moduleId: start, count: 3 });
    collector.stop();
  });

  test("ajutor: recunoaștem cererile, iar helpRequest le trimite", () => {
    expect(isHelpRequest("Ajutor, nu găsesc unde plătesc")).toBe(true);
    expect(isHelpRequest("nu mă descurc aici")).toBe(true);
    expect(isHelpRequest("ascunde Shorts")).toBe(false);
    const { collector, sent } = setup();
    collector.helpRequest("ajutor");
    collector.flush();
    expect(sent()).toMatchObject([{ kind: "help_request", text: "ajutor" }]);
    collector.stop();
  });
});
