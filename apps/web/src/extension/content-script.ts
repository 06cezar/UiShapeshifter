// Content script-ul: rulează în fiecare pagină, de la document_start.
// 1. Rețeta site-ului (B5): citită din stocare și pusă în pagină înainte să se vadă, fără server și fără model.
// 2. După ce pagina s-a încărcat: rădăcina noastră (shadow DOM), chatul (D3), mascota (D2), panoul de control (D9),
//    registrul paginii (B2) și executorul uneltelor. Semnalele (E2) vin tot în etapa 2.

import { mountChat } from "../chat";
import { mountMascot, type MascotController } from "../mascot";
import { mountJournal } from "../journal/mount-journal";
import { proposeChanges } from "../journal/proposal";
import { runPageTool, type PageToolDeps } from "../agent-bridge/page-tools";
import type { AgentRun, ServerMessage, UserNeeds } from "@uishapeshifter/contracts";
import { runAuditUi } from "../a11y";
import { startBasePreferences, type BasePreferences } from "../a11y/base-preferences";
import { applyDislikes, dislikesFromStored } from "../a11y/dislike-rules";
import { thresholdsFor } from "../a11y/thresholds";
import { createPageRegistry } from "../ui/page-registry/registry";
import { buildSelector } from "../ui/page-registry/selector";
import { createRecipeEngine } from "../ui/recipes/recipe-engine";
import { parseStoredRecipe, recipeKey } from "../ui/recipes/recipe-store";
import { SHAPE_ATTR } from "../ui/recipes/dom-ops";
import { isHelpRequest, startSignalCollector, type SignalCollector } from "../signals/collector";
import { needsFromStored, ONBOARDING_KEY, USER_ID_KEY } from "./base-needs";
import { isExcluded } from "./excluded-sites";
import { applyGeneralStyle, generalCssFrom } from "./general-style";
import { pageBackgroundFrom, startPageBackground } from "./page-background";
import { keepClearOfSiteFixed } from "./keep-clear";
import { PAGE_PORT, parseFromWorker, type ToWorker } from "./messages";
import { normalizeHost, pageInfo } from "./page-info";
import { measurePage, type PageMeasure } from "./measure";
import { HOST_ID, mountOurRoot } from "./shadow-root";
import { mountSuggestionBubble } from "./suggestion-bubble";

/** Pus de build.mjs: true în build-ul de dezvoltare, false cu --prod. */
declare const __UIS_DEV__: boolean;

const host = normalizeHost(location.hostname);
/**
 * „Nu schimba acest site” (popup, specs/08): pe un site exclus nu aplicăm singuri nimic (fontul minim C4, ascunderile
 * fără AI, rețeta salvată). Chatul și mascota rămân, ca omul să poată cere ceva sau să repornească din popup.
 */
let excluded = false;
/** Din chat se vede mereu una dintre ele: butonul (chat închis) sau panoul (chat deschis). */
const CHAT_PARTS_SELECTOR = ".chat-launcher, .chat-panel";
/** Ce vede omul în chat când tab-ul are codul vechi al extensiei (după ↻): doar reîncărcarea paginii ajută. */
const RELOAD_PAGE_TEXT = "Extensia s-a actualizat. Reîncarcă pagina (F5) și scrie din nou.";
/** „Reia pas cu pas”: cât așteptăm rularea de la service worker înainte să spunem că n-a mers. */
const LOAD_RUN_TIMEOUT_MS = 10_000;
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
// Popup-ul („Revino la original”) sau alt tab al aceluiași site au schimbat rețeta: o luăm de acolo.
/** Preferințele de bază (C4): fontul minim, contrastul și țintele din profil, fără AI, aplicate ultimele. */
let base: BasePreferences | null = null;
/** Nevoile omului (testul inițial; implicite până atunci): folosite de preferințele de bază și de audit. */
let needs: Partial<UserNeeds> = {};

// Popup-ul („Revino la original”) sau alt tab al aceluiași site au schimbat rețeta: o luăm de acolo.
// Testul inițial a salvat alte nevoi: preferințele de bază se refac după ele.
chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== "local" || excluded) return; // site exclus: nu reaplicăm nimic singuri
  const recipeChange = changes[recipeKey(host)];
  if (recipeChange) {
    recipes.adopt(parseStoredRecipe(recipeChange.newValue, host, new Date().toISOString()));
    base?.refresh();
  }
  // Nevoile s-au putut schimba: testul inițial (cheia „onboarding”) sau profilul local, ținut la zi de service worker.
  if (changes[ONBOARDING_KEY] || (activeUserId && changes[activeUserId])) {
    void refreshDislikes();
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

/**
 * Ce îl deranjează pe om (testul inițial, preferințele „peste tot”), ascuns pe orice site, fără AI (C4).
 * Aceleași chei ca la nevoi: testul inițial și profilul local de sub userId.
 */
async function refreshDislikes(): Promise<void> {
  const first = await chrome.storage.local.get([USER_ID_KEY, ONBOARDING_KEY]);
  const userId = first[USER_ID_KEY];
  const profile = typeof userId === "string" ? await chrome.storage.local.get(userId) : {};
  applyDislikes(dislikesFromStored({ ...first, ...profile }, ONBOARDING_KEY, USER_ID_KEY));
  // Preferințele de aspect „peste tot” (ex. fundal verde), cu CSS-ul lor; apoi fontul minim și contrastul, ultimele.
  const generalCss = generalCssFrom({ ...first, ...profile }, USER_ID_KEY);
  applyGeneralStyle(generalCss);
  // Fundalul cerut se vede și pe site-urile care își pun cutii albe peste el (Bilibili): le colorăm și pe ele.
  const color = pageBackgroundFrom(generalCss);
  if (color !== pageBackgroundColor) {
    stopPageBackground?.();
    stopPageBackground = color ? startPageBackground(color, { ourHostId: HOST_ID }) : null;
    pageBackgroundColor = color;
  }
  base?.refresh();
}

/** Culoarea de fundal „peste tot” pusă acum pe cutiile paginii și cum o scoatem (preferința schimbată sau ștearsă). */
let pageBackgroundColor: string | null = null;
let stopPageBackground: (() => void) | null = null;

/** Ce face mascota la mesajele serverului: se gândește cât rulează agentul, se bucură sau se încurcă la final. */
function moveMascot(mascot: MascotController, server: ServerMessage) {
  if (server.type === "run_started") mascot.setState("thinking");
  else if (server.type === "agent_message") mascot.setState(server.mascot);
  else if (server.type === "run_finished") mascot.setState(server.success ? "happy" : "confused");
  else if (server.type === "error") mascot.setState("confused");
}

/**
 * Bula mascotei ține pasul cu chatul: cât lucrează agentul, gândul lui (rândul de activitate, cu „…”); mesajele și
 * rezumatul final ca mesaje. Cât arată un element (point_at), bula rămâne a lui.
 */
function mascotSpeech(mascot: MascotController, server: ServerMessage, activity: string | null) {
  const pointing = mascot.state() === "pointing";
  if (server.type === "run_started" || server.type === "step") mascot.think(activity);
  else if (server.type === "agent_message" && server.text.trim() && !pointing) mascot.say(server.text.trim());
  else if (server.type === "run_finished" && server.summary.trim() && !pointing) mascot.say(server.summary.trim());
  else if (server.type === "run_finished" || server.type === "error") mascot.think(null);
}

let signals: SignalCollector | null = null;

/** Elementele adăugate de agent (insertHtml, inject, wrap) au SHAPE_ATTR; ce e nou față de începutul rulării. */
function addedShapeIds(): Set<string> {
  return new Set([...document.querySelectorAll(`[${SHAPE_ATTR}]`)].map((element) => element.getAttribute(SHAPE_ATTR)!));
}

function start() {
  let port: chrome.runtime.Port | null = null;
  /** Chatul, după ce e montat: retire() îl folosește ca să-i spună omului să reîncarce pagina. */
  let chatOf: { handleServerMessage(message: ServerMessage): void } | null = null;

  function send(message: ToWorker) {
    // Fără port și fără extensie: codul din tab e cel vechi (↻ pe extensie); altfel mesajul s-ar pierde în tăcere.
    if (!port && !extensionAlive()) return retire();
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
    // Omul a scris poate deja o cerere: îi spunem ce să facă, în loc de „Mă gândesc…” la nesfârșit.
    chatOf?.handleServerMessage({ type: "error", message: RELOAD_PAGE_TEXT });
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
  chatOf = chat;
  const mascot = mountMascot(ourRoot);
  // Propunerile adaptării automate (E3): bula discretă cu Da / Nu; răspunsul pleacă la server.
  const suggestions = mountSuggestionBubble(ourRoot, {
    decide: (suggestionId, decision) =>
      send({ type: "to_server", message: { type: "suggestion_decision", suggestionId, decision } }),
    onShow: () => mascot.setState("speaking"),
  });
  /** Cererile „Reia pas cu pas” trimise service worker-ului, după requestId. */
  const runRequests = new Map<string, { resolve(run: AgentRun): void; reject(error: Error): void }>();
  function loadRun(runId: string): Promise<AgentRun> {
    const requestId = `run-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
    return new Promise((resolve, reject) => {
      runRequests.set(requestId, { resolve, reject });
      send({ type: "load_run", requestId, runId });
      setTimeout(() => {
        if (runRequests.delete(requestId)) reject(new Error("Serverul n-a răspuns la timp."));
      }, LOAD_RUN_TIMEOUT_MS);
    });
  }

  const panel = mountJournal(ourRoot, {
    loadRun,
    send: (message) => {
      if (message.type !== "hello") send({ type: "to_server", message });
    },
    revertToOriginal: async () => {
      await recipes.reset();
      base?.refresh();
    },
    // „Ce ai cerut aici”: o cerere anulată singură, cele de dinainte și de după rămân (B, C).
    requestHistory: () => recipes.history(),
    undoRequest: async (requestId) => {
      const result = await recipes.undoRequest(requestId);
      if (!result.ok) return result;
      base?.refresh();
      return { ok: true };
    },
  });
  /** Revizia rețetei de la începutul fiecărei rulări: „Anulez” o readuce (D9). */
  const runStart = new Map<string, number>();
  /** Elementele adăugate care existau la începutul rulării: la propunere arătăm doar ce e nou. */
  const shapesAtStart = new Map<string, Set<string>>();

  // Butoanele fixe ale site-ului nu se mută cu marginea: chatul nostru urcă deasupra lor, nu stă peste ele.
  const chatBox = ourRoot.shadow.querySelector<HTMLElement>(".chat");
  if (chatBox) keepClearOfSiteFixed(chatBox, ourRoot.host);

  /** Înainte de Păstrez / Anulez: omul trebuie să vadă ce s-a schimbat, deci mascota arată spre elementul nou. */
  function showWhatChanged(runId: string | undefined) {
    const before = runId ? shapesAtStart.get(runId) : undefined;
    if (!before) return;
    const added = [...document.querySelectorAll(`[${SHAPE_ATTR}]`)].find(
      (element) => !before.has(element.getAttribute(SHAPE_ATTR)!) && element.getClientRects().length > 0,
    );
    if (!added) return;
    // În mijlocul ecranului, nu la margine, unde poate sta sub chat: abia apoi mascota arată spre el.
    added.scrollIntoView({ block: "center", behavior: "auto" });
    void mascot.pointAt(added, "Aici e ce am schimbat.");
  }

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
    if (!excluded) base = startBasePreferences({ needs, ourHostId: HOST_ID });
  });
  if (!excluded) void refreshDislikes();

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
    ourHostId: HOST_ID,
    askUser: (question, options) => chat.ask(question, options),
    // „anulează ce am cerut cu X” din chat: la fel ca „Anulez” din lista panoului, apoi limitele de bază din nou
    undoRequest: async (requestId) => {
      const result = await recipes.undoRequest(requestId);
      if (result.ok) base?.refresh();
      return result;
    },
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
      if (mascot.state() !== "pointing") mascot.say(text);
      mascot.setState("speaking");
    },
    pointAt: (element, message) => mascot.pointAt(element, message),
    proposeChanges: async (args, runId) => {
      showWhatChanged(runId);
      const result = await proposeChanges(args, runId, {
        ask: panel.askProposal,
        revisionBefore: (id) => (id ? runStart.get(id) : undefined) ?? recipes.view().revision,
        currentRevision: () => recipes.view().revision,
        undoRun,
      });
      // Păstrez / Anulez e și semnal (specs/09): din ele crește sau scade încrederea pentru aplicarea automată (E3).
      if (result.ok) signals?.proposalDecision(result.data.proposalId, result.data.decision);
      return result;
    },
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
      if (message.type === "run_loaded") {
        const waiting = runRequests.get(message.requestId);
        runRequests.delete(message.requestId);
        if (message.run) waiting?.resolve(message.run);
        else waiting?.reject(new Error(message.error ?? "Rularea nu s-a putut citi."));
        return;
      }
      const server = message.message;
      if (server.type === "tool_call") {
        void runPageTool(server.name, server.args, tools, server.runId).then((result) =>
          send({ type: "to_server", message: { type: "tool_result", callId: server.callId, result } }),
        );
        return;
      }
      if (server.type === "run_started") {
        runStart.set(server.runId, recipes.view().revision);
        shapesAtStart.set(server.runId, addedShapeIds());
      }
      if (server.type === "suggestion") {
        suggestions.show(server.suggestion);
        return;
      }
      chat.handleServerMessage(server);
      mascotSpeech(mascot, server, chat.state().activity);
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

void isExcluded(chrome.storage.local, host).then((isOff) => {
  excluded = isOff;
  // Rețeta cât mai devreme (document_start), ca site-ul să nu apară întâi neschimbat.
  if (!excluded) void recipes.load();
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start, { once: true });
  else start();
});
