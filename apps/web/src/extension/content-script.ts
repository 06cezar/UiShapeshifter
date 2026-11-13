// Content script-ul: rulează în fiecare pagină. Montează rădăcina noastră (shadow DOM) și chatul (D3), și duce mesajele
// pagină ↔ service worker ↔ server. Etapele următoare adaugă aici rețeta (B5), registrul și uneltele (B2), semnalele (E2).

import { mountChat } from "../chat";
import { PAGE_PORT, parseFromWorker, type ToWorker } from "./messages";
import { pageInfo } from "./page-info";
import { mountOurRoot } from "./shadow-root";

/** Dacă service worker-ul a fost oprit de Chrome, portul se închide: ne legăm din nou după atât. */
const RECONNECT_PORT_MS = 1000;

function start() {
  let port: chrome.runtime.Port | null = null;

  function send(message: ToWorker) {
    port?.postMessage(message);
  }

  const chat = mountChat(mountOurRoot(), {
    send: (message) => send({ type: "to_server", message }),
    page: () => pageInfo(location, document.title),
  });

  function connect() {
    port = chrome.runtime.connect({ name: PAGE_PORT });
    port.onMessage.addListener((raw) => {
      const message = parseFromWorker(raw);
      if (!message) return;
      if (message.type === "status") {
        chat.setLinkStatus(message.status);
        return;
      }
      const server = message.message;
      // Uneltele în pagină vin în B2 (registrul și executorul); până atunci răspundem clar, ca rularea să nu aștepte.
      if (server.type === "tool_call") {
        send({
          type: "to_server",
          message: {
            type: "tool_result",
            callId: server.callId,
            result: { ok: false, error: { code: "INTERNAL", message: "Extensia nu execută încă unelte în pagină." } },
          },
        });
        return;
      }
      chat.handleServerMessage(server);
    });
    port.onDisconnect.addListener(() => {
      port = null;
      chat.setLinkStatus("connecting");
      setTimeout(connect, RECONNECT_PORT_MS);
    });
  }

  connect();
}

start();
