// Content script-ul: rulează în fiecare pagină, de la document_start.
// 1. Rețeta site-ului (B5): citită din stocare și pusă în pagină înainte să se vadă, fără server și fără model.
// 2. După ce pagina s-a încărcat: rădăcina noastră (shadow DOM), chatul (D3), registrul paginii (B2) și executorul
//    uneltelor. Mascota și panoul (D) vin în etapa 2, la fel și semnalele (E2).

import { mountChat } from "../chat";
import { runPageTool, type PageToolDeps } from "../agent-bridge/page-tools";
import { createPageRegistry } from "../ui/page-registry/registry";
import { createRecipeEngine } from "../ui/recipes/recipe-engine";
import { parseStoredRecipe, recipeKey } from "../ui/recipes/recipe-store";
import { PAGE_PORT, parseFromWorker, type ToWorker } from "./messages";
import { normalizeHost, pageInfo } from "./page-info";
import { HOST_ID, mountOurRoot } from "./shadow-root";

/** Pus de build.mjs: true în build-ul de dezvoltare, false cu --prod. */
declare const __UIS_DEV__: boolean;

const host = normalizeHost(location.hostname);
/** Din chat se vede mereu una dintre ele: butonul (chat închis) sau panoul (chat deschis). */
const CHAT_PARTS_SELECTOR = ".chat-launcher, .chat-panel";
/** Dacă service worker-ul a fost oprit de Chrome, portul se închide: ne legăm din nou după atât. */
const RECONNECT_PORT_MS = 1000;

// Interfața noastră e vizibilă? (motorul anulează o revizie care ar ascunde-o)
function isOurUiVisible(): boolean {
  const ourHost = document.getElementById(HOST_ID);
  if (!ourHost) return true; // încă nemontată: nimic de stricat
  if (getComputedStyle(ourHost).display === "none") return false;
  const parts = ourHost.shadowRoot?.querySelectorAll(CHAT_PARTS_SELECTOR) ?? [];
  return [...parts].some((part) => {
    const rect = part.getBoundingClientRect();
    return rect.width > 0 && rect.height > 0;
  });
}

const recipes = createRecipeEngine({ host, storage: chrome.storage.local, isOurUiVisible });
// Doar în build-ul de dezvoltare: motorul în consolă, pentru probe manuale (cererea lui B). În DevTools alege contextul
// „UI Shapeshifter” din lista de sus a consolei, apoi: uiRecipes.view(), uiRecipes.applyCss({ css, reason }).
if (__UIS_DEV__) (globalThis as { uiRecipes?: typeof recipes }).uiRecipes = recipes;
void recipes.load();
// Popup-ul („Revino la original”) sau alt tab al aceluiași site au schimbat rețeta: o luăm de acolo.
chrome.storage.onChanged.addListener((changes, area) => {
  const change = changes[recipeKey(host)];
  if (area === "local" && change) recipes.adopt(parseStoredRecipe(change.newValue, host, new Date().toISOString()));
});

function start() {
  let port: chrome.runtime.Port | null = null;

  function send(message: ToWorker) {
    port?.postMessage(message);
  }

  const chat = mountChat(mountOurRoot(), {
    send: (message) => send({ type: "to_server", message }),
    page: () => pageInfo(location, document.title),
  });

  // Registrul paginii (B2), motorul de rețete (B5) și bula chatului pentru `say`.
  const tools: PageToolDeps = {
    registry: createPageRegistry({ ourHostId: HOST_ID, recipe: () => recipes.view() }),
    recipes,
    say: (text) => chat.handleServerMessage({ type: "agent_message", text, mascot: "speaking" }),
  };

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
      if (server.type === "tool_call") {
        void runPageTool(server.name, server.args, tools, server.runId).then((result) =>
          send({ type: "to_server", message: { type: "tool_result", callId: server.callId, result } }),
        );
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

if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start, { once: true });
else start();
