// Socket-ul cu serverul (specs/06): la fiecare deschidere trimite `hello { userId, sessionId }` cu ACELAȘI sessionId
// (generat o dată pe pagină), ca serverul să lege rularea în curs de tab-ul reconectat. Reconectare la 1 s, 2 s, 5 s,
// apoi la 5 s. Mesajele de pe server se verifică înainte să ajungă la cineva.

import type { ClientMessage, ServerMessage } from "@uishapeshifter/contracts";
import type { BridgeStatus } from "./index";
import { parseServerMessage } from "./server-message";

/** specs/06, „Reconectare”; după ultima pauză, încercăm la același interval. */
export const RECONNECT_DELAYS_MS = [1000, 2000, 5000] as const;

/** Un sessionId pe pagină (A: o dată pe pagină, la fiecare reconectare același). */
export const PAGE_SESSION_ID = crypto.randomUUID();

/** Partea din WebSocket de care avem nevoie; în teste o înlocuim cu un socket fals. */
export interface SocketLike {
  readonly readyState: number;
  onopen: ((event: Event) => void) | null;
  onclose: ((event: CloseEvent) => void) | null;
  onmessage: ((event: MessageEvent) => void) | null;
  onerror: ((event: Event) => void) | null;
  send(data: string): void;
  close(): void;
}
export type SocketFactory = (url: string) => SocketLike;

const OPEN = 1; // WebSocket.OPEN

export interface SocketClientOptions {
  url: string;
  userId: string;
  sessionId?: string;
  onMessage: (message: ServerMessage) => void;
  onStatus?: (status: BridgeStatus) => void;
  createSocket?: SocketFactory;
}

export interface SocketClient {
  send(message: ClientMessage): boolean;
  status(): BridgeStatus;
  stop(): void;
}

export function createSocketClient(options: SocketClientOptions): SocketClient {
  const createSocket = options.createSocket ?? ((url: string) => new WebSocket(url));
  const sessionId = options.sessionId ?? PAGE_SESSION_ID;
  let socket: SocketLike | null = null;
  let status: BridgeStatus = "connecting";
  let attempt = 0;
  let stopped = false;
  let retryTimer: ReturnType<typeof setTimeout> | undefined;

  const setStatus = (next: BridgeStatus) => {
    if (next === status) return;
    status = next;
    options.onStatus?.(next);
  };

  function connect() {
    const current = createSocket(options.url);
    socket = current;
    current.onopen = () => {
      attempt = 0;
      current.send(JSON.stringify({ type: "hello", userId: options.userId, sessionId } satisfies ClientMessage));
      setStatus("open");
    };
    current.onmessage = (event) => {
      const message = typeof event.data === "string" ? parseServerMessage(event.data) : null;
      if (!message) {
        console.warn("[punte] Mesaj nerecunoscut de pe server, ignorat:", event.data);
        return;
      }
      if (message.type === "error") console.warn("[punte] Serverul spune:", message.message);
      options.onMessage(message);
    };
    current.onerror = () => {
      // urmează `close`, care se ocupă de reconectare
    };
    current.onclose = () => {
      if (socket !== current) return;
      socket = null;
      if (stopped) return;
      setStatus("connecting");
      const delay = RECONNECT_DELAYS_MS[Math.min(attempt, RECONNECT_DELAYS_MS.length - 1)];
      attempt += 1;
      retryTimer = setTimeout(connect, delay);
    };
  }

  connect();

  return {
    send(message) {
      if (socket?.readyState !== OPEN) return false;
      socket.send(JSON.stringify(message));
      return true;
    },
    status: () => status,
    stop() {
      stopped = true;
      clearTimeout(retryTimer);
      const current = socket;
      socket = null;
      current?.close();
      setStatus("closed");
    },
  };
}
