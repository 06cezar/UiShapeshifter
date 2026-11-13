// Chatul peste orice site: un buton „Spune-mi ce vrei” care deschide un panou cu istoricul, rândul de activitate al
// agentului și un câmp de text. Stă în shadow DOM-ul nostru (extension/shadow-root.ts), deci stilul site-ului nu-l atinge.
// Tot textul primit de la server intră cu `textContent`, niciodată ca HTML: un răspuns nu poate adăuga elemente în pagină.

import type { PageInfo, ServerMessage } from "@uishapeshifter/contracts";
import type { LinkStatus, OutgoingClientMessage } from "../extension/messages";
import type { OurRoot } from "../extension/shadow-root";
import { CHAT_CSS } from "./chat-styles";
import {
  CHAT_TEXT,
  MAX_INPUT_CHARS,
  chatReducer,
  initialChatState,
  sendableText,
  type ChatAction,
  type ChatState,
} from "./chat-state";

export interface ChatOptions {
  /** Trimite un mesaj către server (prin service worker). */
  send(message: OutgoingClientMessage): void;
  /** Pe ce pagină e omul acum, ca agentul să știe pe ce site lucrează. */
  page(): PageInfo;
}

export interface ChatController {
  handleServerMessage(message: ServerMessage): void;
  setLinkStatus(status: LinkStatus): void;
  state(): ChatState;
}

/** Tastele scrise în chat nu trebuie să ajungă la scurtăturile site-ului (ex. „k” sau „/” pe site-uri de video). */
const KEY_EVENTS = ["keydown", "keyup", "keypress"] as const;

export function mountChat(root: OurRoot, options: ChatOptions): ChatController {
  root.addStyle(CHAT_CSS);
  const doc = root.host.ownerDocument;

  const container = doc.createElement("div");
  container.className = "chat";
  container.innerHTML = `
    <button type="button" class="chat-launcher" data-agent-id="chat.toggle" aria-expanded="false" aria-controls="chat-panel"></button>
    <section class="chat-panel" id="chat-panel" role="dialog" aria-label="" hidden>
      <div class="chat-head">
        <p class="chat-title"></p>
        <button type="button" class="chat-close" data-agent-id="chat.close"></button>
      </div>
      <div class="chat-log" role="log" aria-live="polite"></div>
      <p class="chat-activity" role="status"></p>
      <p class="chat-hint" role="status"></p>
      <form class="chat-form">
        <label class="visually-hidden" for="chat-input"></label>
        <input class="chat-input" id="chat-input" type="text" autocomplete="off" data-agent-id="chat.input" />
        <button type="submit" class="chat-send" data-agent-id="chat.send"></button>
      </form>
    </section>`;
  root.shadow.appendChild(container);

  const launcher = container.querySelector<HTMLButtonElement>(".chat-launcher")!;
  const panel = container.querySelector<HTMLElement>(".chat-panel")!;
  const title = container.querySelector<HTMLElement>(".chat-title")!;
  const closeButton = container.querySelector<HTMLButtonElement>(".chat-close")!;
  const log = container.querySelector<HTMLElement>(".chat-log")!;
  const activity = container.querySelector<HTMLElement>(".chat-activity")!;
  const hint = container.querySelector<HTMLElement>(".chat-hint")!;
  const form = container.querySelector<HTMLFormElement>(".chat-form")!;
  const label = container.querySelector<HTMLLabelElement>("label")!;
  const input = container.querySelector<HTMLInputElement>(".chat-input")!;
  const sendButton = container.querySelector<HTMLButtonElement>(".chat-send")!;

  // Textele fixe se pun o singură dată, cu textContent.
  launcher.textContent = CHAT_TEXT.launcher;
  panel.setAttribute("aria-label", CHAT_TEXT.panelLabel);
  title.textContent = CHAT_TEXT.panelLabel;
  closeButton.textContent = CHAT_TEXT.close;
  label.textContent = CHAT_TEXT.inputLabel;
  input.placeholder = CHAT_TEXT.inputPlaceholder;
  input.maxLength = MAX_INPUT_CHARS;
  sendButton.textContent = CHAT_TEXT.send;

  let state = initialChatState();
  /** Id-ul ultimului mesaj desenat: la fel de bun ca lungimea, și prinde și cazul în care istoricul s-a tăiat. */
  let renderedLastId = 0;

  function render() {
    panel.hidden = !state.open;
    launcher.hidden = state.open;
    launcher.setAttribute("aria-expanded", String(state.open));

    // Istoricul se reface doar când s-a schimbat (altfel cititorul de ecran l-ar citi din nou).
    const lastId = state.messages.at(-1)?.id ?? 0;
    if (renderedLastId !== lastId || log.childElementCount === 0) {
      log.replaceChildren();
      if (state.messages.length === 0) {
        const empty = doc.createElement("p");
        empty.className = "chat-empty";
        empty.textContent = CHAT_TEXT.empty;
        log.append(empty);
      }
      for (const message of state.messages) {
        const bubble = doc.createElement("p");
        bubble.className = "chat-bubble";
        bubble.dataset.role = message.role;
        bubble.dataset.error = String(message.isError);
        bubble.textContent = message.text;
        log.append(bubble);
      }
      renderedLastId = lastId;
      log.scrollTop = log.scrollHeight;
    }

    activity.textContent = state.activity ?? "";
    hint.textContent = state.link === "closed" ? CHAT_TEXT.linkClosed : "";
  }

  function dispatch(action: ChatAction) {
    state = chatReducer(state, action);
    render();
  }

  function open() {
    dispatch({ type: "open" });
    input.focus();
  }

  function close() {
    dispatch({ type: "close" });
    launcher.focus();
  }

  launcher.addEventListener("click", open);
  closeButton.addEventListener("click", close);

  form.addEventListener("submit", (event) => {
    event.preventDefault();
    const text = sendableText(input.value);
    if (!text) return;
    input.value = "";
    dispatch({ type: "user_sent", text });
    options.send({ type: "user_message", text, source: "text", page: options.page() });
  });

  for (const type of KEY_EVENTS) {
    container.addEventListener(type, (event) => {
      event.stopPropagation();
      if (type === "keydown" && (event as KeyboardEvent).key === "Escape" && state.open) close();
    });
  }

  render();

  return {
    handleServerMessage: (message) => dispatch({ type: "server", message }),
    setLinkStatus: (status) => dispatch({ type: "link", status }),
    state: () => state,
  };
}
