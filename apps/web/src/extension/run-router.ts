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
    case "suggestion":
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

export interface RunRouterOptions<P> {
  /** Portul tab-ului activ acum (service worker-ul îl știe din chrome.tabs); pentru rulările fără tab. */
  activePort?(): P | undefined;
}

export function createRunRouter<P>(options: RunRouterOptions<P> = {}): RunRouter<P> {
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
      /**
       * Unde lucrează o rulare fără tab al ei: tab-ul activ (adaptarea vine din click-urile ratate de acolo), altfel
       * ultimul tab care a cerut ceva (nota lui A pe #39).
       */
      const fallback = () => {
        const active = options.activePort?.();
        if (active !== undefined && openPorts.has(active)) return active;
        return lastRequester !== null && openPorts.has(lastRequester) ? lastRequester : undefined;
      };
      if (message.type === "run_started") {
        if (message.origin === "user") {
          // Rularea cerută de om e a tab-ului care a cerut (neschimbat).
          const port = waitingForRun.shift();
          if (port !== undefined) portOfRun.set(message.runId, port);
        } else {
          // Adaptarea (E3) și testul inițial (C3) le pornește serverul: n-au tab, dar uneltele lor trebuie să ajungă undeva.
          const port = fallback();
          if (port !== undefined) portOfRun.set(message.runId, port);
        }
      }
      const owner = runId ? portOfRun.get(runId) : (lastRequester ?? undefined);
      if (message.type === "run_finished" && runId) portOfRun.delete(runId);
      if (owner !== undefined && openPorts.has(owner)) return [owner];
      if (message.type === "tool_call") {
        // O rulare necunoscută (ex. service worker repornit) sau al cărei tab s-a închis: mai bine aici decât TIMEOUT.
        const port = runId && portOfRun.has(runId) ? undefined : fallback();
        return port !== undefined ? [port] : [];
      }
      // Mesajele de afișat (pași, răspunsuri) le vede oricine e deschis.
      return [...openPorts];
    },

    forget(port) {
      for (const [runId, owner] of portOfRun) if (owner === port) portOfRun.delete(runId);
      for (let i = waitingForRun.length - 1; i >= 0; i--) if (waitingForRun[i] === port) waitingForRun.splice(i, 1);
      if (lastRequester === port) lastRequester = null;
    },
  };
}
