// Starea chatului: ce mesaje se văd și ce face agentul acum. Funcții pure, fără DOM, ca să se testeze ușor
// (panoul din chat-panel.ts doar desenează starea). Textele pentru om sunt în română, scurte.

import type { ServerMessage } from "@uishapeshifter/contracts";
import type { LinkStatus } from "../extension/messages";

/** Cât ține istoricul din bulă; mesajele mai vechi se aruncă. */
export const MAX_MESSAGES = 50;
/** Cât poate scrie omul într-o cerere. */
export const MAX_INPUT_CHARS = 500;
/** Cât din ce face agentul se arată pe rândul de activitate. */
const ACTIVITY_MAX_CHARS = 80;

export const CHAT_TEXT = {
  launcher: "Cu ce te pot ajuta?",
  close: "Închide",
  send: "Trimite",
  inputLabel: "Ce vrei să schimb pe pagina asta?",
  inputPlaceholder: "De exemplu: ascunde reclamele",
  panelLabel: "Chat cu agentul",
  empty: "Spune-mi ce să schimb pe pagina asta și mă apuc.",
  thinking: "Mă gândesc…",
  started: "Mă uit la pagină…",
  linkLost: "Am pierdut legătura cu serverul. Încearcă din nou în câteva secunde.",
  linkClosed: "Serverul nu răspunde.",
  errorPrefix: "Ceva n-a mers:",
  voiceStart: "Vorbește",
  voiceStop: "Oprește ascultarea",
  voiceListening: "Te ascult…",
} as const;

export interface ChatMessage {
  id: number;
  role: "user" | "agent";
  text: string;
  isError: boolean;
}

export interface ChatState {
  open: boolean;
  messages: ChatMessage[];
  /** Agentul lucrează la o cerere (de la trimitere până la run_finished sau eroare). */
  working: boolean;
  /** Ce face agentul chiar acum, într-un rând; null când nu lucrează. */
  activity: string | null;
  link: LinkStatus;
  nextId: number;
}

export type ChatAction =
  | { type: "open" }
  | { type: "close" }
  | { type: "user_sent"; text: string }
  | { type: "server"; message: ServerMessage }
  | { type: "link"; status: LinkStatus };

export function initialChatState(): ChatState {
  return { open: false, messages: [], working: false, activity: null, link: "connecting", nextId: 1 };
}

function clip(text: string, max: number): string {
  const oneLine = text.replace(/\s+/g, " ").trim();
  return oneLine.length > max ? `${oneLine.slice(0, max - 1)}…` : oneLine;
}

function addMessage(state: ChatState, role: ChatMessage["role"], text: string, isError = false): ChatState {
  const last = state.messages.at(-1);
  // Agentul spune uneori același lucru în `say` și în rezumatul final: o dată e destul. Dacă a doua oară e o eroare,
  // bula rămasă devine de eroare (eșecul nu trebuie pierdut).
  if (last && last.role === role && last.text === text) {
    if (!isError || last.isError) return state;
    return { ...state, messages: [...state.messages.slice(0, -1), { ...last, isError: true }] };
  }
  const message: ChatMessage = { id: state.nextId, role, text, isError };
  return { ...state, messages: [...state.messages, message].slice(-MAX_MESSAGES), nextId: state.nextId + 1 };
}

/** Ce poate trimite omul: text nevid, nu mai lung decât limita. Întoarce textul curățat sau null. */
export function sendableText(raw: string): string | null {
  const text = raw.trim();
  return text.length > 0 && text.length <= MAX_INPUT_CHARS ? text : null;
}

function onServerMessage(state: ChatState, message: ServerMessage): ChatState {
  switch (message.type) {
    case "run_started":
      return { ...state, working: true, activity: CHAT_TEXT.started };
    case "step": {
      const doing = clip(message.step.decision || message.step.observation, ACTIVITY_MAX_CHARS);
      return doing ? { ...state, working: true, activity: doing } : state;
    }
    case "agent_message":
      return message.text.trim() ? addMessage(state, "agent", message.text.trim()) : state;
    case "run_finished": {
      const done: ChatState = { ...state, working: false, activity: null };
      return message.summary.trim() ? addMessage(done, "agent", message.summary.trim(), !message.success) : done;
    }
    case "error":
      return addMessage(
        { ...state, working: false, activity: null },
        "agent",
        `${CHAT_TEXT.errorPrefix} ${message.message}`,
        true,
      );
    default:
      // tool_call și restul nu sunt pentru chat
      return state;
  }
}

export function chatReducer(state: ChatState, action: ChatAction): ChatState {
  switch (action.type) {
    case "open":
      return { ...state, open: true };
    case "close":
      return { ...state, open: false };
    case "user_sent":
      return { ...addMessage(state, "user", action.text), working: true, activity: CHAT_TEXT.thinking };
    case "server":
      return onServerMessage(state, action.message);
    case "link": {
      const next = { ...state, link: action.status };
      // Cât lucra, legătura s-a rupt: nu mai așteptăm un răspuns care nu mai vine.
      return action.status === "closed" && state.working
        ? addMessage({ ...next, working: false, activity: null }, "agent", CHAT_TEXT.linkLost, true)
        : next;
    }
  }
}
