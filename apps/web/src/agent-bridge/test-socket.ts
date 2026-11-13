// Doar pentru teste: un WebSocket fals pe care testul îl „deschide”, îi trimite mesaje și îl închide.

import type { SocketFactory, SocketLike } from "./socket-client";

const CONNECTING = 0;
const OPEN = 1;
const CLOSED = 3;

export class FakeSocket implements SocketLike {
  readyState = CONNECTING;
  onopen: ((event: Event) => void) | null = null;
  onclose: ((event: CloseEvent) => void) | null = null;
  onmessage: ((event: MessageEvent) => void) | null = null;
  onerror: ((event: Event) => void) | null = null;
  /** Ce a trimis clientul, deja parsat din JSON. */
  readonly sent: unknown[] = [];

  constructor(readonly url: string) {}

  send(data: string): void {
    this.sent.push(JSON.parse(data));
  }

  close(): void {
    if (this.readyState === CLOSED) return;
    this.readyState = CLOSED;
    this.onclose?.(new CloseEvent("close"));
  }

  // ---------- comenzile testului ----------

  open(): void {
    this.readyState = OPEN;
    this.onopen?.(new Event("open"));
  }

  receive(message: unknown): void {
    const data = typeof message === "string" ? message : JSON.stringify(message);
    this.onmessage?.(new MessageEvent("message", { data }));
  }

  /** Serverul închide conexiunea (sau cade rețeaua). */
  drop(): void {
    this.close();
  }
}

/** Fabrica de socket-uri false; `sockets` le ține în ordinea creării (una pe conectare). */
export function fakeSocketFactory(): SocketFactory & { sockets: FakeSocket[]; last(): FakeSocket } {
  const sockets: FakeSocket[] = [];
  const factory = (url: string) => {
    const socket = new FakeSocket(url);
    sockets.push(socket);
    return socket;
  };
  return Object.assign(factory, {
    sockets,
    last: () => {
      const socket = sockets.at(-1);
      if (!socket) throw new Error("niciun socket creat încă");
      return socket;
    },
  });
}
