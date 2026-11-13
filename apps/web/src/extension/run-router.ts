// Cui îi trimite service worker-ul un mesaj de pe server (specs/06): fiecare rulare aparține tab-ului din care a
// plecat cererea (`runId → tab`). Funcții pure, generice pe „port”, ca să se poată testa fără Chrome.

import type { ServerMessage } from "@uishapeshifter/contracts";

/** Rularea căreia îi aparține mesajul, dacă se poate ști din el. */
export function runIdOf(message: ServerMessage): string | undefined {
  switch (message.type) {
    case "run_started":
    case "tool_call":
    case "run_finished":
      return message.runId;
    case "step":
      return message.step.runId;
    case "agent_message":
      return message.runId;
    case "error":
      return undefined;
  }
}

export interface RunRouter<P> {
  /** Tab-ul a trimis un user_message: rularea care pornește acum e a lui. */
  requestedBy(port: P): void;
  /** Porturile cărora le trimitem mesajul. */
  targetsFor(message: ServerMessage, openPorts: ReadonlySet<P>): P[];
  /** Tab închis: uităm rulările lui. */
  forget(port: P): void;
}

export function createRunRouter<P>(): RunRouter<P> {
  const portOfRun = new Map<string, P>();
  /** Cererile trimise, în ordine: serverul răspunde cu run_started în aceeași ordine. */
  const waitingForRun: P[] = [];
  /** Ultimul tab care a cerut ceva: primește mesajele fără runId (ex. „error”). */
  let lastRequester: P | null = null;

  return {
    requestedBy(port) {
      waitingForRun.push(port);
      lastRequester = port;
    },

    targetsFor(message, openPorts) {
      const runId = runIdOf(message);
      // Doar rulările cerute de om răspund unei cereri; adaptarea și testul inițial le pornește serverul singur.
      if (message.type === "run_started" && message.origin === "user") {
        const port = waitingForRun.shift();
        if (port !== undefined) portOfRun.set(message.runId, port);
      }
      const owner = runId ? portOfRun.get(runId) : (lastRequester ?? undefined);
      if (message.type === "run_finished" && runId) portOfRun.delete(runId);
      if (owner !== undefined && openPorts.has(owner)) return [owner];
      // Rularea nu mai are tab (închis) sau nu știm a cui e (ex. adaptare pornită de server): o vede oricine e deschis.
      return message.type === "tool_call" ? [] : [...openPorts];
    },

    forget(port) {
      for (const [runId, owner] of portOfRun) if (owner === port) portOfRun.delete(runId);
      for (let i = waitingForRun.length - 1; i >= 0; i--) if (waitingForRun[i] === port) waitingForRun.splice(i, 1);
      if (lastRequester === port) lastRequester = null;
    },
  };
}
