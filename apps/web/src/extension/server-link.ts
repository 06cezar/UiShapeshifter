// Legătura service worker → server: un singur WebSocket pentru toate tab-urile (specs/01, „Părțile extensiei”).
// Se reconectează singur și trimite din când în când hello, ca Chrome să nu oprească service worker-ul cât e deschis.

import type { ClientMessage, ServerMessage } from "@uishapeshifter/contracts";
import { parseServerMessage, type LinkStatus } from "./messages";

/** Reîncercările de conectare: 1 s, 2 s, apoi la 5 s. */
const RECONNECT_DELAYS_MS = [1000, 2000, 5000];
/**
 * Chrome oprește un service worker inactiv după ~30 s; traficul pe WebSocket îl ține pornit (Chrome 116+).
 * hello e idempotent pe server (aceeași sesiune), deci e cel mai simplu mesaj de „sunt aici”.
 */
const KEEPALIVE_MS = 20_000;

/** Ce folosim din WebSocket, ca testele să poată da unul fals. */
export interface SocketLike {
  readyState: number;
  send(data: string): void;
  close(): void;
  onopen: (() => void) | null;
  onclose: (() => void) | null;
  onerror: (() => void) | null;
  onmessage: ((event: { data: unknown }) => void) | null;
}

export interface ServerLinkOptions {
  url: string;
  userId: string;
  sessionId: string;
  onMessage(message: ServerMessage): void;
  onStatus(status: LinkStatus): void;
  createSocket?: (url: string) => SocketLike;
  /** Timere injectabile pentru teste. */
  setTimer?: (fn: () => void, ms: number) => unknown;
  clearTimer?: (handle: unknown) => void;
}

export interface ServerLink {
  /** Trimite acum dacă socket-ul e deschis, altfel după reconectare. */
  send(message: ClientMessage): void;
  status(): LinkStatus;
  stop(): void;
}

const OPEN = 1;

export function startServerLink(options: ServerLinkOptions): ServerLink {
  const createSocket = options.createSocket ?? ((url: string) => new WebSocket(url) as unknown as SocketLike);
  const setTimer = options.setTimer ?? ((fn: () => void, ms: number) => setTimeout(fn, ms));
  const clearTimer = options.clearTimer ?? ((handle: unknown) => clearTimeout(handle as number));

  let socket: SocketLike | null = null;
  let status: LinkStatus = "connecting";
  let attempt = 0;
  let stopped = false;
  let reconnectTimer: unknown = null;
  let keepaliveTimer: unknown = null;
  const waiting: ClientMessage[] = [];

  const hello = (): ClientMessage => ({ type: "hello", userId: options.userId, sessionId: options.sessionId });

  function setStatus(next: LinkStatus) {
    if (next === status) return;
    status = next;
    options.onStatus(next);
  }

  function keepalive() {
    keepaliveTimer = setTimer(() => {
      if (socket?.readyState === OPEN) socket.send(JSON.stringify(hello()));
      keepalive();
    }, KEEPALIVE_MS);
  }

  function connect() {
    if (stopped) return;
    setStatus("connecting");
    const current = createSocket(options.url);
    socket = current;
    current.onopen = () => {
      attempt = 0;
      current.send(JSON.stringify(hello()));
      for (const message of waiting.splice(0)) current.send(JSON.stringify(message));
      setStatus("open");
    };
    current.onmessage = (event) => {
      const message = typeof event.data === "string" ? parseServerMessage(event.data) : null;
      if (message) options.onMessage(message);
      else console.warn("extensie: mesaj de pe server nerecunoscut", event.data);
    };
    current.onerror = () => current.close();
    current.onclose = () => {
      if (socket !== current) return;
      socket = null;
      if (stopped) return setStatus("closed");
      setStatus("closed");
      const delay = RECONNECT_DELAYS_MS[Math.min(attempt, RECONNECT_DELAYS_MS.length - 1)]!;
      attempt += 1;
      reconnectTimer = setTimer(connect, delay);
    };
  }

  connect();
  keepalive();

  return {
    send(message) {
      if (socket?.readyState === OPEN) socket.send(JSON.stringify(message));
      else waiting.push(message);
    },
    status: () => status,
    stop() {
      stopped = true;
      clearTimer(reconnectTimer);
      clearTimer(keepaliveTimer);
      socket?.close();
    },
  };
}
