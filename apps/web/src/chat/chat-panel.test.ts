import { beforeEach, describe, expect, test, vi } from "vitest";
import type { PageInfo } from "@uishapeshifter/contracts";
import { HOST_ID, mountOurRoot } from "../extension/shadow-root";
import type { OutgoingClientMessage } from "../extension/messages";
import { mountChat } from "./chat-panel";
import { CHAT_TEXT } from "./chat-state";

const PAGE: PageInfo = { url: "https://example.com/a", host: "example.com", title: "Exemplu" };

function setup() {
  document.getElementById(HOST_ID)?.remove();
  const sent: OutgoingClientMessage[] = [];
  const chat = mountChat(mountOurRoot(document), { send: (message) => sent.push(message), page: () => PAGE });
  const shadow = document.getElementById(HOST_ID)!.shadowRoot!;
  const q = <T extends Element>(selector: string) => shadow.querySelector<T>(selector)!;
  return { chat, sent, shadow, q };
}

function type(input: HTMLInputElement, text: string) {
  input.value = text;
  input.form!.dispatchEvent(new Event("submit", { cancelable: true, bubbles: true }));
}

beforeEach(() => {
  document.body.innerHTML = "";
});

describe("deschidere", () => {
  test("pornește închis; butonul îl deschide și mută focusul în câmp", () => {
    const { q } = setup();
    expect(q<HTMLElement>(".chat-panel").hidden).toBe(true);
    q<HTMLButtonElement>(".chat-launcher").click();
    expect(q<HTMLElement>(".chat-panel").hidden).toBe(false);
    expect(q<HTMLElement>(".chat-launcher").hidden).toBe(true);
  });

  test("Escape îl închide și redă butonul", () => {
    const { q } = setup();
    q<HTMLButtonElement>(".chat-launcher").click();
    q<HTMLInputElement>(".chat-input").dispatchEvent(
      new KeyboardEvent("keydown", { key: "Escape", bubbles: true, composed: true }),
    );
    expect(q<HTMLElement>(".chat-panel").hidden).toBe(true);
    expect(q<HTMLElement>(".chat-launcher").hidden).toBe(false);
  });
});

describe("trimitere", () => {
  test("trimite user_message cu pagina și golește câmpul", () => {
    const { q, sent } = setup();
    q<HTMLButtonElement>(".chat-launcher").click();
    type(q<HTMLInputElement>(".chat-input"), "  ascunde Shorts ");
    expect(sent).toEqual([{ type: "user_message", text: "ascunde Shorts", source: "text", page: PAGE }]);
    expect(q<HTMLInputElement>(".chat-input").value).toBe("");
    expect(q<HTMLElement>(".chat-bubble").textContent).toBe("ascunde Shorts");
    expect(q<HTMLElement>(".chat-activity").textContent).toBe(CHAT_TEXT.thinking);
  });

  test("un câmp gol nu trimite nimic", () => {
    const { q, sent } = setup();
    type(q<HTMLInputElement>(".chat-input"), "   ");
    expect(sent).toHaveLength(0);
  });
});

describe("răspunsul agentului", () => {
  test("apare în bulă; textul cu HTML rămâne text și nu adaugă elemente", () => {
    const { chat, q, shadow } = setup();
    chat.handleServerMessage({ type: "agent_message", text: '<img src=x onerror="alert(1)">Gata', mascot: "happy" });
    expect(q<HTMLElement>(".chat-bubble").textContent).toBe('<img src=x onerror="alert(1)">Gata');
    expect(shadow.querySelector("img")).toBeNull();
  });

  test("pașii se văd pe rândul de activitate, iar la final dispar", () => {
    const { chat, q } = setup();
    chat.handleServerMessage({ type: "run_started", runId: "r1", goal: "g", origin: "user" });
    chat.handleServerMessage({
      type: "step",
      step: { runId: "r1", index: 0, ts: "t", observation: "o", decision: "Ascund raftul", reason: "r" },
    });
    expect(q<HTMLElement>(".chat-activity").textContent).toBe("Ascund raftul");
    chat.handleServerMessage({ type: "run_finished", runId: "r1", success: true, summary: "Am ascuns raftul." });
    expect(q<HTMLElement>(".chat-activity").textContent).toBe("");
    expect(q<HTMLElement>(".chat-bubble").textContent).toBe("Am ascuns raftul.");
  });

  test("serverul căzut se spune în chat", () => {
    const { chat, q } = setup();
    chat.setLinkStatus("closed");
    expect(q<HTMLElement>(".chat-hint").textContent).toBe(CHAT_TEXT.linkClosed);
    chat.setLinkStatus("open");
    expect(q<HTMLElement>(".chat-hint").textContent).toBe("");
  });
});

describe("tastele", () => {
  test("ce scrii în chat nu ajunge la scurtăturile site-ului", () => {
    const { q } = setup();
    const onPage = vi.fn();
    document.addEventListener("keydown", onPage);
    q<HTMLButtonElement>(".chat-launcher").click();
    q<HTMLInputElement>(".chat-input").dispatchEvent(
      new KeyboardEvent("keydown", { key: "k", bubbles: true, composed: true }),
    );
    expect(onPage).not.toHaveBeenCalled();
    document.removeEventListener("keydown", onPage);
  });
});
