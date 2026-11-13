// Content script-ul: rulează în fiecare pagină. În etapa 0 montează rădăcina noastră (shadow DOM), arată un semn
// că extensia e aici și duce un mesaj de probă pagină → service worker → server și înapoi (punctul de control M0).
// Etapele următoare adaugă aici rețeta (B5), registrul și uneltele (B2), semnalele (E2), chatul și mascota (D).

import type { ServerMessage } from "@uishapeshifter/contracts";
import { PAGE_PORT, parseFromWorker, type LinkStatus, type ToWorker } from "./messages";
import { pageInfo } from "./page-info";
import { mountOurRoot } from "./shadow-root";

const PROBE_TEXT = "Probă de la extensie";
/** Dacă service worker-ul a fost oprit de Chrome, portul se închide: ne legăm din nou după atât. */
const RECONNECT_PORT_MS = 1000;

const STATUS_TEXT: Record<LinkStatus, string> = {
  connecting: "se conectează…",
  open: "conectat la server",
  closed: "serverul nu răspunde",
};

const BADGE_CSS = `
.badge {
  position: fixed; right: 16px; bottom: 16px; max-width: min(560px, calc(100vw - 32px));
  display: flex; align-items: center; gap: var(--uis-space);
  padding: var(--uis-space) calc(var(--uis-space) * 2);
  background: var(--uis-bg); color: var(--uis-fg);
  font: var(--uis-font-size)/1.5 var(--uis-font);
  border-radius: var(--uis-radius);
  box-shadow: var(--uis-shadow);
}
.dot { width: 12px; height: 12px; border-radius: 50%; background: var(--uis-warn); flex: none; }
.dot[data-status="open"] { background: var(--uis-ok); }
.dot[data-status="closed"] { background: var(--uis-error); }
.reply { color: var(--uis-muted); }
button {
  min-height: var(--uis-target); min-width: var(--uis-target);
  padding: 0 calc(var(--uis-space) * 2);
  font: inherit; color: var(--uis-bg); background: var(--uis-accent);
  border: none; border-radius: var(--uis-radius); cursor: pointer;
}
button:focus-visible { outline: 3px solid var(--uis-fg); outline-offset: 2px; }
`;

/** Ce spunem pe insignă despre răspunsul serverului la probă. */
function describeReply(message: ServerMessage): string | null {
  switch (message.type) {
    case "run_started":
      return "Serverul a primit proba ✓";
    case "agent_message":
      return `Agentul: ${message.text}`;
    case "run_finished":
      return message.success ? "Rularea s-a terminat ✓" : "Rularea s-a terminat (fără unelte în pagină încă)";
    case "error":
      return `Eroare de la server: ${message.message}`;
    default:
      return null;
  }
}

function startBadge() {
  const root = mountOurRoot();
  root.addStyle(BADGE_CSS);

  const badge = document.createElement("div");
  badge.className = "badge";
  badge.setAttribute("role", "status");
  badge.innerHTML = `
    <span class="dot" aria-hidden="true"></span>
    <span><strong>UI Shapeshifter</strong> · <span class="status">${STATUS_TEXT.connecting}</span></span>
    <span class="reply"></span>
    <button type="button" data-agent-id="extension.probe">Trimite proba</button>`;
  root.shadow.appendChild(badge);

  const dot = badge.querySelector<HTMLElement>(".dot")!;
  const statusText = badge.querySelector<HTMLElement>(".status")!;
  const replyText = badge.querySelector<HTMLElement>(".reply")!;
  const probeButton = badge.querySelector<HTMLButtonElement>("button")!;

  let port: chrome.runtime.Port | null = null;

  function send(message: ToWorker) {
    port?.postMessage(message);
  }

  function connect() {
    port = chrome.runtime.connect({ name: PAGE_PORT });
    port.onMessage.addListener((raw) => {
      const message = parseFromWorker(raw);
      if (!message) return;
      if (message.type === "status") {
        dot.dataset.status = message.status;
        statusText.textContent = STATUS_TEXT[message.status];
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
      const reply = describeReply(server);
      if (reply) replyText.textContent = reply;
    });
    port.onDisconnect.addListener(() => {
      port = null;
      dot.dataset.status = "connecting";
      statusText.textContent = STATUS_TEXT.connecting;
      setTimeout(connect, RECONNECT_PORT_MS);
    });
  }

  probeButton.addEventListener("click", () => {
    replyText.textContent = "Trimit…";
    send({
      type: "to_server",
      message: { type: "user_message", text: PROBE_TEXT, source: "text", page: pageInfo(location, document.title) },
    });
  });

  connect();
}

startBadge();
