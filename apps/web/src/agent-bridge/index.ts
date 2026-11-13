// Puntea agentului (specs/04, „Puntea agentului”): singurul WebSocket al aplicației și registrul de elemente.
// Contractul pentru colegi: C (audit_ui), D (mascota, chatul, panoul), E (semnalele) folosesc DOAR ce e exportat aici.
// Implementarea vine în pașii următori ai B2; interfețele de aici nu se schimbă fără anunț (--type contract).

import type {
  ClientMessage,
  ServerMessage,
  ToolData,
  ToolName,
  ToolResult,
  UISnapshot,
} from "@uishapeshifter/contracts";
import type { ConfigStore } from "../ui/config-store";

/** Starea socket-ului: „connecting” și la reconectare (1 s, 2 s, 5 s, apoi la 5 s). */
export type BridgeStatus = "connecting" | "open" | "closed";

/** Ce pot trimite colegii. `hello` și `tool_result` le trimite doar puntea. */
export type OutgoingMessage = Extract<ClientMessage, { type: "user_message" | "cancel_run" | "signals" }>;

/** Mesajul de pe server cu tipul `T`, ex. `ServerMessageOf<"step">`. */
export type ServerMessageOf<T extends ServerMessage["type"]> = Extract<ServerMessage, { type: T }>;

// ---------- registrul de elemente ----------

/** Ce știe componenta despre elementul ei; restul se măsoară din DOM. */
export interface ElementMeta {
  role?: string;
  label?: string;
  /** Modulul elementului; fără el, se ia din cel mai apropiat strămoș cu `data-module-id`. */
  moduleId?: string;
}

export interface SnapshotOptions {
  /** Doar elementele acestui modul, plus navigația. */
  moduleId?: string;
}

export type VisibilityResult = "visible" | "scrolled" | "hidden";

export interface AgentRegistry {
  /** Elementul cu `data-agent-id` = id, înregistrat sau găsit în DOM. */
  get(id: string): HTMLElement | undefined;
  ids(): string[];
  /** Snapshot-ul complet, cu toate elementele (pentru audit și semnale). */
  snapshot(opts?: SnapshotOptions): UISnapshot;
  /** Snapshot-ul pentru model: vizibile, din modulul curent + navigația, numere rotunjite, cel mult 80. */
  compactSnapshot(opts?: SnapshotOptions): UISnapshot;
  /** Coordonatele în viewport, măsurate acum. */
  rectOf(id: string): DOMRect | undefined;
  /** „hidden” = în meniu închis sau alt modul (NOT_VISIBLE); „scrolled” = era în afara ecranului și s-a derulat. */
  ensureVisible(id: string): Promise<VisibilityResult>;
  /** Folosit de `useAgentElement`; întoarce scoaterea din registru. */
  register(id: string, element: HTMLElement, meta?: ElementMeta): () => void;
}

// ---------- uneltele web ----------

/** Ce primește un handler de unealtă, pe lângă argumente. */
export interface ToolContext {
  runId: string;
  callId: string;
  store: ConfigStore;
  registry: AgentRegistry;
}

/**
 * Argumentele vin de la model, neverificate de server: handler-ul le verifică înainte de folosire
 * și întoarce INVALID_ARGS dacă nu se potrivesc cu `ToolArgs[N]`.
 */
export type ToolHandler<N extends ToolName> = (
  args: unknown,
  ctx: ToolContext,
) => ToolResult<ToolData[N]> | Promise<ToolResult<ToolData[N]>>;

// ---------- puntea ----------

export interface AgentBridge {
  /** Trimite un mesaj; `false` dacă socket-ul nu e deschis (nu există coadă). */
  send(message: OutgoingMessage): boolean;
  /** Abonare la un tip de mesaj de pe server; întoarce dezabonarea. */
  on<T extends ServerMessage["type"]>(type: T, handler: (message: ServerMessageOf<T>) => void): () => void;
  /** O singură unealtă pe nume: o a doua înregistrare o înlocuiește pe prima (cu avertisment în consolă). */
  registerTool<N extends ToolName>(name: N, handler: ToolHandler<N>): () => void;
  status(): BridgeStatus;
  onStatus(listener: (status: BridgeStatus) => void): () => void;
  /** Închide socket-ul și oprește reconectarea. */
  stop(): void;
}

// ---------- implementarea ----------

export { startAgentBridge } from "./bridge";
export type { StartBridgeOptions } from "./bridge";
export { AgentBridgeProvider, useAgentBridge } from "./react";
export { useAgentElement, useRegistry } from "../ui/registry-context";
