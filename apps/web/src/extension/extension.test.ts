// Testele scheletului extensiei (E5): legătura cu serverul, stocarea locală, mesajele și rădăcina shadow DOM.
// Drumul real (Chrome + server) se verifică încărcând extensia: pașii sunt în README.

import { describe, expect, test } from "vitest";
import type { ClientMessage, ServerMessage } from "@uishapeshifter/contracts";
import { needsFromStorage, needsFromStored } from "./base-needs";
import { savedChangesText } from "./popup-text";
import { parseServerMessage, parseToWorker } from "./messages";
import { normalizeHost, pageInfo } from "./page-info";
import { createRunRouter } from "./run-router";
import { startServerLink, type SocketLike } from "./server-link";
import { HOST_ID, mountOurRoot } from "./shadow-root";
import { mountSuggestionBubble } from "./suggestion-bubble";
import { getOrCreateSessionId, getOrCreateUserId, type KeyValueStore } from "./storage";

function memoryStore(): KeyValueStore & { data: Record<string, unknown> } {
  const data: Record<string, unknown> = {};
  return {
    data,
    get: async (keys) => Object.fromEntries([keys].flat().map((key) => [key, data[key]])),
    set: async (items) => void Object.assign(data, items),
  };
}

class FakeSocket implements SocketLike {
  readyState = 0;
  sent: ClientMessage[] = [];
  onopen: (() => void) | null = null;
  onclose: (() => void) | null = null;
  onerror: (() => void) | null = null;
  onmessage: ((event: { data: unknown }) => void) | null = null;
  send(data: string) {
    this.sent.push(JSON.parse(data) as ClientMessage);
  }
  close() {
    this.readyState = 3;
    this.onclose?.();
  }
  open() {
    this.readyState = 1;
    this.onopen?.();
  }
}

function fakeTimers() {
  const timers: { fn: () => void; ms: number }[] = [];
  return {
    timers,
    setTimer: (fn: () => void, ms: number) => timers.push({ fn, ms }),
    clearTimer: () => {},
  };
}

describe("legătura cu serverul", () => {
  test("la deschidere trimite hello, apoi ce aștepta; răspunsurile ajung la onMessage", () => {
    const sockets: FakeSocket[] = [];
    const received: string[] = [];
    const statuses: string[] = [];
    const link = startServerLink({
      url: "ws://test",
      userId: "u-1",
      sessionId: "s-1",
      onMessage: (message) => received.push(message.type),
      onStatus: (status) => statuses.push(status),
      createSocket: () => sockets[sockets.push(new FakeSocket()) - 1]!,
      ...fakeTimers(),
    });
    link.send({ type: "user_message", text: "probă", source: "text" });
    sockets[0]!.open();
    expect(sockets[0]!.sent.map((m) => m.type)).toEqual(["hello", "user_message"]);
    expect(sockets[0]!.sent[0]).toEqual({ type: "hello", userId: "u-1", sessionId: "s-1" });
    sockets[0]!.onmessage?.({ data: JSON.stringify({ type: "run_started", runId: "r", goal: "g", origin: "user" }) });
    sockets[0]!.onmessage?.({ data: "nu e json" });
    expect(received).toEqual(["run_started"]);
    expect(statuses).toEqual(["open"]);
  });

  test("după ce se închide, se reconectează cu întârzieri crescătoare", () => {
    const sockets: FakeSocket[] = [];
    const timers = fakeTimers();
    startServerLink({
      url: "ws://test",
      userId: "u-1",
      sessionId: "s-1",
      onMessage: () => {},
      onStatus: () => {},
      createSocket: () => sockets[sockets.push(new FakeSocket()) - 1]!,
      ...timers,
    });
    sockets[0]!.close();
    sockets.at(-1)!.close();
    const reconnectDelays = timers.timers.map((t) => t.ms).filter((ms) => ms < 20_000);
    expect(reconnectDelays).toEqual([1000]);
    timers.timers.find((t) => t.ms === 1000)!.fn();
    expect(sockets).toHaveLength(2);
    sockets[1]!.close();
    expect(timers.timers.map((t) => t.ms).filter((ms) => ms < 20_000)).toEqual([1000, 2000]);
  });
});

describe("stocarea locală", () => {
  test("userId și sessionId se generează o dată și rămân aceleași", async () => {
    const store = memoryStore();
    const first = await getOrCreateUserId(store);
    expect(first).toMatch(/^u-[a-f0-9]{8}$/);
    expect(await getOrCreateUserId(store)).toBe(first);
    const session = await getOrCreateSessionId(store);
    expect(await getOrCreateSessionId(store)).toBe(session);
  });
});

describe("mesajele din extensie", () => {
  test("pagina poate trimite doar mesaje permise către server, nu hello", () => {
    expect(parseToWorker({ type: "to_server", message: { type: "user_message", text: "x", source: "text" } })).not.toBe(
      null,
    );
    expect(parseToWorker({ type: "to_server", message: { type: "hello", userId: "x", sessionId: "y" } })).toBe(null);
    expect(parseToWorker("text")).toBe(null);
    expect(parseToWorker({ type: "get_status" })).toEqual({ type: "get_status" });
  });

  test("de pe server trec doar tipurile cunoscute", () => {
    expect(parseServerMessage(JSON.stringify({ type: "error", message: "x" }))).toEqual({
      type: "error",
      message: "x",
    });
    expect(parseServerMessage(JSON.stringify({ type: "necunoscut" }))).toBe(null);
  });
});

describe("rădăcina shadow DOM", () => {
  test("se montează o singură dată, cu tema noastră", () => {
    const first = mountOurRoot(document);
    const second = mountOurRoot(document);
    expect(second.host).toBe(first.host);
    expect(document.querySelectorAll(`#${HOST_ID}`)).toHaveLength(1);
    expect(first.shadow.querySelector("style")?.textContent).toContain("--uis-font-size");
    // Inline cu !important, ca o regulă largă a agentului (* { display: none }) să nu ne ascundă interfața.
    expect(first.host.style.getPropertyValue("display")).toBe("block");
    expect(first.host.style.getPropertyPriority("display")).toBe("important");
  });
});

describe("rutarea runId → tab", () => {
  const started = (runId: string, origin: "user" | "adaptation" = "user") =>
    ({ type: "run_started", runId, goal: "g", origin }) as const;
  const finished = (runId: string) => ({ type: "run_finished", runId, success: true, summary: "" }) as const;
  const toolCall = (runId: string) =>
    ({ type: "tool_call", runId, callId: "c", name: "say", args: { message: "x" } }) as unknown as ServerMessage;

  test("mesajele unei rulări ajung doar în tab-ul care a cerut-o", () => {
    const router = createRunRouter<string>();
    const open = new Set(["tab-a", "tab-b"]);
    router.requestedBy("tab-a");
    router.requestedBy("tab-b");
    expect(router.targetsFor(started("r1"), open)).toEqual(["tab-a"]);
    expect(router.targetsFor(started("r2"), open)).toEqual(["tab-b"]);
    expect(router.targetsFor(toolCall("r2"), open)).toEqual(["tab-b"]);
    expect(router.targetsFor(finished("r1"), open)).toEqual(["tab-a"]);
  });

  test("o rulare pornită de server nu ia cererea unui tab; tool_call spre un tab închis nu pleacă nicăieri", () => {
    const router = createRunRouter<string>();
    const open = new Set(["tab-a"]);
    router.requestedBy("tab-a");
    expect(router.targetsFor(started("adapt", "adaptation"), open)).toEqual(["tab-a"]);
    expect(router.targetsFor(started("r1"), open)).toEqual(["tab-a"]);
    router.forget("tab-a");
    expect(router.targetsFor(toolCall("r1"), new Set())).toEqual([]);
  });
});

describe("rulările pornite de server (adaptare, test inițial)", () => {
  const started = (runId: string, origin: "user" | "adaptation" | "onboarding") =>
    ({ type: "run_started", runId, goal: "g", origin }) as const;
  const toolCall = (runId: string) =>
    ({ type: "tool_call", runId, callId: "c", name: "say", args: { message: "x" } }) as unknown as ServerMessage;

  test("uneltele lor merg la tab-ul activ, chiar dacă alt tab a cerut ceva înainte", () => {
    const router = createRunRouter<string>({ activePort: () => "tab-b" });
    const open = new Set(["tab-a", "tab-b"]);
    router.requestedBy("tab-a");
    router.targetsFor(started("r-user", "user"), open);
    router.targetsFor(started("r-adapt", "adaptation"), open);
    expect(router.targetsFor(toolCall("r-adapt"), open)).toEqual(["tab-b"]);
  });

  test("fără tab activ cunoscut, merg la ultimul tab care a cerut ceva", () => {
    const router = createRunRouter<string>();
    const open = new Set(["tab-a", "tab-b"]);
    router.requestedBy("tab-a");
    router.targetsFor(started("r-user", "user"), open);
    router.targetsFor(started("r-adapt", "adaptation"), open);
    expect(router.targetsFor(toolCall("r-adapt"), open)).toEqual(["tab-a"]);
  });

  test("fără nicio cerere și fără tab activ, nicăieri", () => {
    const open = new Set(["tab-a", "tab-b"]);
    const withActive = createRunRouter<string>({ activePort: () => "tab-b" });
    withActive.targetsFor(started("r-onb", "onboarding"), open);
    expect(withActive.targetsFor(toolCall("r-onb"), open)).toEqual(["tab-b"]);
    const noActive = createRunRouter<string>();
    noActive.targetsFor(started("r-onb", "onboarding"), open);
    expect(noActive.targetsFor(toolCall("r-onb"), open)).toEqual([]);
  });

  test("o rulare necunoscută (service worker repornit) nu se pierde: tab-ul activ", () => {
    const router = createRunRouter<string>({ activePort: () => "tab-a" });
    expect(router.targetsFor(toolCall("r-necunoscut"), new Set(["tab-a"]))).toEqual(["tab-a"]);
  });
});

describe("nevoile pentru preferințele de bază", () => {
  test("din ce a salvat testul inițial păstrăm doar câmpurile cunoscute; lipsă sau stricat = implicite", () => {
    expect(needsFromStorage({ skipped: false, needs: { minFontPx: 20, contrast: "high", minTargetPx: "x" } })).toEqual({
      minFontPx: 20,
      contrast: "high",
    });
    expect(needsFromStorage(undefined)).toEqual({});
    expect(needsFromStorage({ needs: "stricat" })).toEqual({});
  });
});

describe("nevoile: profilul local întâi (E8)", () => {
  test("profilul local bate testul inițial; fără profil, testul inițial; fără nimic, implicite", () => {
    const profile = { userId: "u-1", needs: { minFontPx: 24 } };
    expect(needsFromStored({ userId: "u-1", "u-1": profile, onboarding: { needs: { minFontPx: 18 } } })).toEqual({
      minFontPx: 24,
    });
    expect(needsFromStored({ userId: "u-1", onboarding: { needs: { minFontPx: 18 } } })).toEqual({ minFontPx: 18 });
    expect(needsFromStored({})).toEqual({});
  });
});

describe("textele popup-ului", () => {
  test("acordul în română: 1, 2–19, de la 20 în sus cu „de”", () => {
    expect(savedChangesText(1)).toBe("o schimbare salvată");
    expect(savedChangesText(3)).toBe("3 schimbări salvate");
    expect(savedChangesText(20)).toBe("20 de schimbări salvate");
    expect(savedChangesText(101)).toBe("101 schimbări salvate");
  });
});

describe("pagina din care vine cererea", () => {
  test("host fără www. și cu litere mici", () => {
    expect(normalizeHost("WWW.Exemplu.RO")).toBe("exemplu.ro");
    expect(pageInfo({ href: "https://www.site.ro/a", hostname: "www.site.ro" }, "T")).toEqual({
      url: "https://www.site.ro/a",
      host: "site.ro",
      title: "T",
    });
  });
});

describe("bula de propunere (E3)", () => {
  test("arată textul serverului, „Da” trimite accept și închide; fără răspuns se închide singură", () => {
    const decisions: string[] = [];
    let timeout: (() => void) | null = null;
    const root = mountOurRoot(document);
    const bubble = mountSuggestionBubble(root, {
      decide: (id, decision) => decisions.push(`${id}:${decision}`),
      setTimer: (fn) => (timeout = fn),
      clearTimer: () => {},
    });
    const el = () => root.shadow.querySelector<HTMLElement>(".suggestion")!;
    const suggestion = {
      id: "sug-1",
      trigger: "small-targets" as const,
      text: "<b>Butoanele</b> par greu de apăsat. Le măresc?",
      goal: "g",
      risk: "low" as const,
      createdAt: "x",
    };
    bubble.show(suggestion);
    expect(el().hidden).toBe(false);
    expect(el().querySelector(".suggestion-text")!.textContent).toBe(suggestion.text); // text, nu HTML
    expect(el().querySelector("b")).toBe(null);
    el().querySelector<HTMLButtonElement>(".yes")!.click();
    expect(decisions).toEqual(["sug-1:accept"]);
    expect(el().hidden).toBe(true);
    bubble.show({ ...suggestion, id: "sug-2" });
    timeout!();
    expect(el().hidden).toBe(true);
    expect(decisions).toEqual(["sug-1:accept"]);
  });
});
