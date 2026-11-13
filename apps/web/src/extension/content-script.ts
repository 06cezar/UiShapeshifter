// Content script-ul: rulează în fiecare pagină, de la document_start.
// 1. Rețeta site-ului (B5): citită din stocare și pusă în pagină înainte să se vadă, fără server și fără model.
// 2. După ce pagina s-a încărcat: rădăcina noastră (shadow DOM), insigna cu un câmp de cerere, registrul paginii (B2)
//    și executorul uneltelor. Chatul și mascota (D) înlocuiesc insigna; semnalele (E2) vin în etapa 2.

import type { ServerMessage } from "@uishapeshifter/contracts";
import { runPageTool, type PageToolDeps } from "../agent-bridge/page-tools";
import { createPageRegistry } from "../ui/page-registry/registry";
import { createRecipeEngine } from "../ui/recipes/recipe-engine";
import { parseStoredRecipe, recipeKey } from "../ui/recipes/recipe-store";
import { PAGE_PORT, parseFromWorker, type LinkStatus, type ToWorker } from "./messages";
import { normalizeHost, pageInfo } from "./page-info";
import { HOST_ID, mountOurRoot } from "./shadow-root";

const PROBE_TEXT = "Probă de la extensie";
const host = normalizeHost(location.hostname);

// Interfața noastră e vizibilă? (motorul anulează o revizie care ar ascunde-o)
function isOurUiVisible(): boolean {
  const ourHost = document.getElementById(HOST_ID);
  if (!ourHost) return true; // încă nemontată: nimic de stricat
  const badge = ourHost.shadowRoot?.querySelector(".badge");
  const rect = badge?.getBoundingClientRect();
  return getComputedStyle(ourHost).display !== "none" && !!rect && rect.width > 0 && rect.height > 0;
}

const recipes = createRecipeEngine({ host, storage: chrome.storage.local, isOurUiVisible });
void recipes.load();
// Popup-ul („Revino la original”) sau alt tab al aceluiași site au schimbat rețeta: o luăm de acolo.
chrome.storage.onChanged.addListener((changes, area) => {
  const change = changes[recipeKey(host)];
  if (area === "local" && change) recipes.adopt(parseStoredRecipe(change.newValue, host, new Date().toISOString()));
});
/** Dacă service worker-ul a fost oprit de Chrome, portul se închide: ne legăm din nou după atât. */
const RECONNECT_PORT_MS = 1000;

const STATUS_TEXT: Record<LinkStatus, string> = {
  connecting: "se conectează…",
  open: "conectat la server",
  closed: "serverul nu răspunde",
};

const BADGE_CSS = `
.badge {
  position: fixed; right: 16px; bottom: 16px; width: min(420px, calc(100vw - 32px)); box-sizing: border-box;
  display: flex; flex-direction: column; gap: var(--uis-space);
  padding: calc(var(--uis-space) * 1.5) calc(var(--uis-space) * 2);
  background: var(--uis-bg); color: var(--uis-fg);
  font: var(--uis-font-size)/1.5 var(--uis-font);
  border-radius: calc(var(--uis-space) * 2);
  box-shadow: var(--uis-shadow);
}
.head { display: flex; align-items: center; gap: var(--uis-space); }
.reply:empty { display: none; }
.ask { display: flex; gap: var(--uis-space); }
.ask input { flex: 1; min-width: 0; }
.dot { width: 12px; height: 12px; border-radius: 50%; background: var(--uis-warn); flex: none; }
.dot[data-status="open"] { background: var(--uis-ok); }
.dot[data-status="closed"] { background: var(--uis-error); }
.reply { color: var(--uis-muted); }
input {
  min-height: var(--uis-target); padding: 0 calc(var(--uis-space) * 1.5);
  font: inherit; color: var(--uis-bg); background: var(--uis-fg);
  border: none; border-radius: var(--uis-radius);
}
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
      return message.success ? `Gata ✓ ${message.summary}` : `Nu a mers: ${message.summary}`;
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
    <div class="head">
      <span class="dot" aria-hidden="true"></span>
      <span><strong>UI Shapeshifter</strong> · <span class="status">${STATUS_TEXT.connecting}</span></span>
    </div>
    <div class="reply"></div>
    <div class="ask">
      <input type="text" data-agent-id="extension.request" aria-label="Ce vrei să schimbi pe pagină?"
        placeholder="Ce vrei să schimbi?" />
      <button type="button" data-agent-id="extension.probe">Trimite</button>
    </div>`;
  root.shadow.appendChild(badge);

  const dot = badge.querySelector<HTMLElement>(".dot")!;
  const statusText = badge.querySelector<HTMLElement>(".status")!;
  const replyText = badge.querySelector<HTMLElement>(".reply")!;
  const probeButton = badge.querySelector<HTMLButtonElement>("button")!;
  const requestInput = badge.querySelector<HTMLInputElement>("input")!;

  let port: chrome.runtime.Port | null = null;

  // Registrul paginii (B2) și uneltele din pagină. Motorul de rețete (B5) se adaugă ca `recipes`.
  const tools: PageToolDeps = {
    registry: createPageRegistry({ ourHostId: HOST_ID, recipe: () => recipes.view() }),
    recipes,
    say: (text) => (replyText.textContent = `Agentul: ${text}`),
  };

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
      if (server.type === "tool_call") {
        void runPageTool(server.name, server.args, tools, server.runId).then((result) =>
          send({ type: "to_server", message: { type: "tool_result", callId: server.callId, result } }),
        );
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

  // Câmpul gol trimite proba din etapa 0; altfel, cererea omului (până vine chatul lui D).
  function sendRequest() {
    const text = requestInput.value.trim() || PROBE_TEXT;
    replyText.textContent = "Trimit…";
    requestInput.value = "";
    send({
      type: "to_server",
      message: { type: "user_message", text, source: "text", page: pageInfo(location, document.title) },
    });
  }
  probeButton.addEventListener("click", sendRequest);
  requestInput.addEventListener("keydown", (event) => {
    if (event.key === "Enter") sendRequest();
  });

  connect();
}

if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", startBadge, { once: true });
else startBadge();
