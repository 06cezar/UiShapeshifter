// Content script-ul: rulează în fiecare pagină, de la document_start.
// 1. Rețeta site-ului (B5): citită din stocare și pusă în pagină înainte să se vadă, fără server și fără model.
// 2. După ce pagina s-a încărcat: rădăcina noastră (shadow DOM), chatul (D3), registrul paginii (B2) și executorul
//    uneltelor. Mascota și panoul (D) vin în etapa 2, la fel și semnalele (E2).

import { mountChat } from "../chat";
import { runPageTool, type PageToolDeps } from "../agent-bridge/page-tools";
import type { UserNeeds } from "@uishapeshifter/contracts";
import { runAuditUi } from "../a11y";
import { startBasePreferences, type BasePreferences } from "../a11y/base-preferences";
import { thresholdsFor } from "../a11y/thresholds";
import { createPageRegistry } from "../ui/page-registry/registry";
import { buildSelector } from "../ui/page-registry/selector";
import { createRecipeEngine } from "../ui/recipes/recipe-engine";
import { parseStoredRecipe, recipeKey } from "../ui/recipes/recipe-store";
import { needsFromStorage, ONBOARDING_KEY } from "./base-needs";
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
/** Preferințele de bază (C4): fontul minim, contrastul și țintele din profil, fără AI, aplicate ultimele. */
let base: BasePreferences | null = null;
/** Nevoile omului (testul inițial; implicite până atunci): folosite de preferințele de bază și de audit. */
let needs: Partial<UserNeeds> = {};

// Popup-ul („Revino la original”) sau alt tab al aceluiași site au schimbat rețeta: o luăm de acolo.
// Testul inițial a salvat alte nevoi: preferințele de bază se refac după ele.
chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== "local") return;
  const recipeChange = changes[recipeKey(host)];
  if (recipeChange) {
    recipes.adopt(parseStoredRecipe(recipeChange.newValue, host, new Date().toISOString()));
    base?.refresh();
  }
  const needsChange = changes[ONBOARDING_KEY];
  if (needsChange) {
    needs = needsFromStorage(needsChange.newValue);
    base?.update(needs);
  }
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

  // Preferințele de bază pornesc cu nevoile salvate de testul inițial (sau implicite) și se reaplică peste rețetă.
  void chrome.storage.local.get(ONBOARDING_KEY).then((saved) => {
    needs = needsFromStorage(saved[ONBOARDING_KEY]);
    base = startBasePreferences({ needs, ourHostId: HOST_ID });
  });

  // Registrul paginii (B2), motorul de rețete (B5) și bula chatului pentru `say`.
  const registry = createPageRegistry({ ourHostId: HOST_ID, recipe: () => recipes.view() });
  const tools: PageToolDeps = {
    registry,
    recipes: {
      // După fiecare CSS al agentului, fontul minim se verifică din nou (C4: „ultimele, peste tot ce a scris agentul”).
      async applyCss(args) {
        const result = await recipes.applyCss(args);
        if (result.ok) base?.refresh();
        return result;
      },
    },
    // Auditul (C2): aceleași id-uri și selectori ca snapshot-ul și aceleași nevoi ca preferințele de bază.
    audit: (args) =>
      runAuditUi(args, {
        thresholds: () => thresholdsFor(needs),
        identity: { idOf: registry.idOf, selectorOf: (element) => buildSelector(element) },
        ourHostId: HOST_ID,
        revision: () => recipes.view().revision,
        regionElement: (regionId) => registry.elementOf(regionId),
        pauseRecipe: recipes.pause,
      }),
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
