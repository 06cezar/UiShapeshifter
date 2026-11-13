// Content script-ul: rulează în fiecare pagină, de la document_start.
// 1. Rețeta site-ului (B5): citită din stocare și pusă în pagină înainte să se vadă, fără server și fără model.
// 2. După ce pagina s-a încărcat: rădăcina noastră (shadow DOM), chatul (D3), mascota (D2), panoul de control (D9),
//    registrul paginii (B2) și executorul uneltelor. Semnalele (E2) vin tot în etapa 2.

import { mountChat } from "../chat";
import { mountMascot, type MascotController } from "../mascot";
import { mountJournal } from "../journal/mount-journal";
import { proposeChanges } from "../journal/proposal";
import { runPageTool, type PageToolDeps } from "../agent-bridge/page-tools";
import type { ServerMessage, UserNeeds } from "@uishapeshifter/contracts";
import { runAuditUi } from "../a11y";
import { startBasePreferences, type BasePreferences } from "../a11y/base-preferences";
import { thresholdsFor } from "../a11y/thresholds";
import { createPageRegistry } from "../ui/page-registry/registry";
import { buildSelector } from "../ui/page-registry/selector";
import { createRecipeEngine } from "../ui/recipes/recipe-engine";
import { parseStoredRecipe, recipeKey } from "../ui/recipes/recipe-store";
import { isHelpRequest, startSignalCollector, type SignalCollector } from "../signals/collector";
import { needsFromStored, ONBOARDING_KEY, USER_ID_KEY } from "./base-needs";
import { PAGE_PORT, parseFromWorker, type ToWorker } from "./messages";
import { normalizeHost, pageInfo } from "./page-info";
import { measurePage, type PageMeasure } from "./measure";
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

/** Butonul „Ajută-mă” al unei componente adăugate de agent (B3, askAgent): pornește o cerere nouă, ca din chat. */
let askAgentFromPage: ((goal: string) => void) | null = null;
const recipes = createRecipeEngine({
  host,
  storage: chrome.storage.local,
  isOurUiVisible,
  askAgent: (goal) => askAgentFromPage?.(goal),
});
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
  // Nevoile s-au putut schimba: testul inițial (cheia „onboarding”) sau profilul local, ținut la zi de service worker.
  if (changes[ONBOARDING_KEY] || (activeUserId && changes[activeUserId])) {
    void readNeeds().then((next) => {
      if (JSON.stringify(next) === JSON.stringify(needs)) return; // profilul s-a schimbat, nevoile nu
      needs = next;
      base?.update(needs);
    });
  }
});

/** userId-ul anonim (E5): sub el stă profilul local (E8). */
let activeUserId: string | undefined;

/** Nevoile pentru preferințele de bază: profilul local (E8), altfel testul inițial, altfel implicite. */
async function readNeeds(): Promise<Partial<UserNeeds>> {
  const first = await chrome.storage.local.get([USER_ID_KEY, ONBOARDING_KEY]);
  const userId = first[USER_ID_KEY];
  activeUserId = typeof userId === "string" ? userId : undefined;
  const profile = activeUserId ? await chrome.storage.local.get(activeUserId) : {};
  return needsFromStored({ ...first, ...profile });
}

/** Ce face mascota la mesajele serverului: se gândește cât rulează agentul, se bucură sau se încurcă la final. */
function moveMascot(mascot: MascotController, server: ServerMessage) {
  if (server.type === "run_started") mascot.setState("thinking");
  else if (server.type === "agent_message") mascot.setState(server.mascot);
  else if (server.type === "run_finished") mascot.setState(server.success ? "happy" : "confused");
  else if (server.type === "error") mascot.setState("confused");
}

let signals: SignalCollector | null = null;

function start() {
  let port: chrome.runtime.Port | null = null;

  function send(message: ToWorker) {
    try {
      port?.postMessage(message);
    } catch {
      retire(); // extensia a fost reîncărcată: tab-ul ăsta mai are doar codul vechi
    }
  }

  /**
   * După ↻ pe extensie, paginile deja deschise rămân cu codul vechi, care nu mai poate vorbi cu extensia
   * („Extension context invalidated”). Ne oprim în liniște; pagina primește codul nou la reîncărcare.
   */
  function retire() {
    port = null;
    signals?.stop();
    signals = null;
  }
  const extensionAlive = () => Boolean(chrome.runtime?.id);

  askAgentFromPage = (goal) =>
    send({
      type: "to_server",
      message: { type: "user_message", text: goal, source: "text", page: pageInfo(location, document.title) },
    });

  const ourRoot = mountOurRoot();
  const chat = mountChat(ourRoot, {
    send: (message) => {
      // „ajutor” în chat e și un semnal pentru adaptare (E2), pe lângă cererea către agent
      if (message.type === "user_message" && isHelpRequest(message.text)) signals?.helpRequest(message.text);
      send({ type: "to_server", message });
    },
    page: () => pageInfo(location, document.title),
  });
  const mascot = mountMascot(ourRoot);
  const panel = mountJournal(ourRoot, {
    send: (message) => {
      if (message.type !== "hello") send({ type: "to_server", message });
    },
    revertToOriginal: async () => {
      await recipes.reset();
      base?.refresh();
    },
  });
  /** Revizia rețetei de la începutul fiecărei rulări: „Anulez” o readuce (D9). */
  const runStart = new Map<string, number>();

  /**
   * Readuce rețeta exact la revizia de la începutul rulării (B6: CSS și operațiile de structură, reviziile de după se
   * șterg). O rulare pornită înainte de reîncărcare n-are revizie de start: atunci nu ghicim și nu ștergem nimic.
   */
  async function undoRun(runId: string | undefined): Promise<number> {
    const start = runId ? runStart.get(runId) : undefined;
    if (start !== undefined) await recipes.revertTo(start);
    base?.refresh();
    return recipes.view().revision;
  }

  // Preferințele de bază pornesc cu nevoile din profilul local (sau din testul inițial, sau implicite) și se reaplică
  // peste rețetă.
  void readNeeds().then((saved) => {
    needs = saved;
    base = startBasePreferences({ needs, ourHostId: HOST_ID });
  });

  // Registrul paginii (B2), motorul de rețete (B5), bula chatului pentru `say` și mascota pentru `point_at` (D2).
  const registry = createPageRegistry({ ourHostId: HOST_ID, recipe: () => recipes.view() });

  // Semnalele de utilizare (E2): loturi la cel mult 5 s, cu pagina pe care s-au întâmplat; serverul le dă adaptării (E3).
  signals = startSignalCollector({
    ourHostId: HOST_ID,
    idOf: registry.idOf,
    regionIdOf: registry.regionIdOf,
    send: (batch) =>
      send({
        type: "to_server",
        message: { type: "signals", signals: batch, page: pageInfo(location, document.title) },
      }),
  });
  addEventListener("pagehide", () => signals?.flush());
  const tools: PageToolDeps = {
    registry,
    recipes: {
      // După fiecare CSS al agentului, fontul minim se verifică din nou (C4: „ultimele, peste tot ce a scris agentul”).
      async applyCss(args) {
        const result = await recipes.applyCss(args);
        if (result.ok) base?.refresh();
        return result;
      },
      // La fel după operațiile de structură (B6): elementele mutate sau adăugate primesc și ele limitele.
      async applyOps(args) {
        const result = await recipes.applyOps(args);
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
    say: (text) => {
      chat.handleServerMessage({ type: "agent_message", text, mascot: "speaking" });
      mascot.setState("speaking");
    },
    pointAt: (element, message) => mascot.pointAt(element, message),
    proposeChanges: (args, runId) =>
      proposeChanges(args, runId, {
        ask: panel.askProposal,
        revisionBefore: (id) => (id ? runStart.get(id) : undefined) ?? recipes.view().revision,
        currentRevision: () => recipes.view().revision,
        undoRun,
      }),
  };

  // Doar în build-ul de dezvoltare: măsurătorile pentru pitch (E4). În consolă: uiMeasure() sau uiMeasure("Caută").
  if (__UIS_DEV__) {
    (globalThis as { uiMeasure?: (target?: string) => PageMeasure }).uiMeasure = (target) =>
      measurePage(
        {
          ourHostId: HOST_ID,
          thresholds: () => thresholdsFor(needs),
          idOf: registry.idOf,
          selectorOf: (element) => buildSelector(element),
          revision: () => recipes.view().revision,
          pauseRecipe: recipes.pause,
        },
        target,
      );
  }

  function connect() {
    if (!extensionAlive()) return retire();
    try {
      port = chrome.runtime.connect({ name: PAGE_PORT });
    } catch {
      return retire();
    }
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
      if (server.type === "run_started") runStart.set(server.runId, recipes.view().revision);
      chat.handleServerMessage(server);
      moveMascot(mascot, server);
      panel.journal.getState().handleServerMessage(server);
    });
    port.onDisconnect.addListener(() => {
      port = null;
      if (!extensionAlive()) return retire();
      chat.setLinkStatus("connecting");
      setTimeout(connect, RECONNECT_PORT_MS);
    });
  }

  connect();
}

if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start, { once: true });
else start();
