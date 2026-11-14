// Service worker-ul extensiei (Manifest V3): ține legătura cu serverul și duce mesajele între pagini și server.
// Paginile (content script) și popup-ul se leagă prin porturi; serverul vede o singură sesiune pentru tot browserul,
// iar mesajele unei rulări ajung în tab-ul din care a plecat cererea (`runId → tab`, specs/06).

import { SERVER_PORT, type ServerMessage } from "@uishapeshifter/contracts";
import { ONBOARDING_KEY } from "./base-needs";
import { PAGE_PORT, POPUP_PORT, parseToWorker, type FromWorker } from "./messages";
import { normalizeHost } from "./page-info";
import { createRunRouter } from "./run-router";
import { startServerLink, type ServerLink } from "./server-link";
import { getOrCreateSessionId, getOrCreateUserId } from "./storage";
import { PROFILE_RETRY_MS, syncProfile } from "../sync/profile-sync";
import { changeNeedsPush, currentAccount, PUSH_DELAY_MS, pull, push, USER_ID_KEY } from "../sync/account-sync";

/** Pus de build.mjs: true dacă pagina testului inițial (C3) e în build. */
declare const __UIS_ONBOARDING__: boolean;

// La instalare se deschide testul inițial (C3, specs/10): ce citește comod, ce îl deranjează, ce site-uri cunoaște.
// Rezultatul ajunge în chrome.storage.local („onboarding”) și pe server, de unde îl citesc fontul minim și agentul.
chrome.runtime.onInstalled.addListener(({ reason }) => {
  if (__UIS_ONBOARDING__ && reason === "install") {
    void chrome.tabs.create({ url: chrome.runtime.getURL("onboarding.html") });
  }
});

/**
 * Omul a închis browserul fără să termine (sau să omită) testul: la următoarea pornire îl deschidem din nou, o singură
 * dată, altfel rămâne cu valorile implicite fără să știe că testul există.
 */
async function reopenUnfinishedOnboarding(): Promise<void> {
  if ((await chrome.storage.local.get(ONBOARDING_KEY))[ONBOARDING_KEY]) return; // terminat sau omis
  const url = chrome.runtime.getURL("onboarding.html");
  if ((await chrome.tabs.query({ url })).length > 0) return; // Chrome a redeschis deja tab-ul
  await chrome.tabs.create({ url });
}
chrome.runtime.onStartup.addListener(() => {
  if (__UIS_ONBOARDING__) void reopenUnfinishedOnboarding();
});

const SERVER_WS_URL = `ws://localhost:${SERVER_PORT}/ws`;
const SERVER_API_URL = `http://localhost:${SERVER_PORT}/api`;

/**
 * Profilul (E8) ținut și local: îl aducem de pe server la pornire și după fiecare rulare (agentul îl poate schimba cu
 * update_profile). Fără server, păstrăm copia locală și mai încercăm peste puțin.
 */
let profileRetry: ReturnType<typeof setTimeout> | undefined;
function refreshProfile(): void {
  if (!userId) return;
  clearTimeout(profileRetry);
  void syncProfile({ apiUrl: SERVER_API_URL, userId, storage: chrome.storage.local }).then((outcome) => {
    if (outcome === "offline") profileRetry = setTimeout(refreshProfile, PROFILE_RETRY_MS);
  });
}

const pagePorts = new Set<chrome.runtime.Port>();
const popupPorts = new Set<chrome.runtime.Port>();
/** Tab-ul activ acum: aici lucrează rulările pornite de server (adaptarea, testul inițial), care n-au tab al lor. */
let activeTabId: number | undefined;
chrome.tabs.onActivated.addListener(({ tabId }) => (activeTabId = tabId));
// După o repornire a service worker-ului nu știm încă tab-ul activ: îl cerem o dată.
// După o repornire a service worker-ului, „currentWindow” poate să nu existe: luăm fereastra folosită ultima.
void chrome.tabs.query({ active: true, lastFocusedWindow: true }).then(([tab]) => (activeTabId ??= tab?.id));
const router = createRunRouter<chrome.runtime.Port>({
  activePort: () => [...pagePorts].find((port) => port.sender?.tab?.id === activeTabId),
  hostOf: (port) => {
    try {
      return port.sender?.tab?.url ? normalizeHost(new URL(port.sender.tab.url).hostname) : undefined;
    } catch {
      return undefined;
    }
  },
});
let userId: string | null = null;
let link: ServerLink | null = null;

function post(port: chrome.runtime.Port, message: FromWorker): void {
  try {
    port.postMessage(message);
  } catch {
    // portul s-a închis între timp (tab închis): onDisconnect îl scoate
  }
}

function statusMessage(): FromWorker {
  return { type: "status", status: link?.status() ?? "connecting", userId };
}

function broadcastStatus(): void {
  for (const port of [...pagePorts, ...popupPorts]) post(port, statusMessage());
}

function routeFromServer(message: ServerMessage): void {
  if (message.type === "run_finished") refreshProfile();
  for (const port of router.targetsFor(message, pagePorts)) post(port, { type: "from_server", message });
}

/** Pornește legătura cu serverul pentru userId-ul activ (anonim, sau al contului după login, E6). */
async function startLink(): Promise<ServerLink> {
  userId = await getOrCreateUserId(chrome.storage.local);
  const sessionId = await getOrCreateSessionId(chrome.storage.session);
  link = startServerLink({
    url: SERVER_WS_URL,
    userId,
    sessionId,
    onMessage: routeFromServer,
    onStatus: broadcastStatus,
  });
  broadcastStatus();
  refreshProfile();
  return link;
}
let linkReady: Promise<ServerLink> = startLink();

// Contul (E6): după login userId-ul activ devine cel al contului, deci legătura pornește din nou cu el; cu cont,
// orice schimbare de rețetă sau de profil pleacă la server după o pauză scurtă (specs/08).
let pushTimer: ReturnType<typeof setTimeout> | undefined;
const syncOptions = { apiUrl: SERVER_API_URL, storage: chrome.storage.local };
chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== "local") return;
  const changedUser = changes[USER_ID_KEY];
  if (changedUser && typeof changedUser.newValue === "string" && changedUser.newValue !== userId) {
    link?.stop();
    linkReady = startLink();
  }
  if (!changeNeedsPush(Object.keys(changes), userId ?? undefined)) return;
  clearTimeout(pushTimer);
  pushTimer = setTimeout(() => void push(syncOptions), PUSH_DELAY_MS);
});
// La pornire, cu cont: ce s-a schimbat pe alt dispozitiv între timp.
void currentAccount(chrome.storage.local).then((account) => {
  if (account) void pull(syncOptions);
});

chrome.runtime.onConnect.addListener((port) => {
  const ports = port.name === POPUP_PORT ? popupPorts : port.name === PAGE_PORT ? pagePorts : null;
  if (!ports) return port.disconnect();
  ports.add(port);
  post(port, statusMessage());

  port.onMessage.addListener((raw) => {
    const message = parseToWorker(raw);
    if (!message) return console.warn("extensie: mesaj nerecunoscut de la", port.name, raw);
    if (message.type === "get_status") return post(port, statusMessage());
    if (port.name === PAGE_PORT && message.message.type === "user_message") router.requestedBy(port);
    if (
      port.name === PAGE_PORT &&
      message.message.type === "suggestion_decision" &&
      message.message.decision === "accept"
    ) {
      router.acceptedSuggestionIn(port);
    }
    void linkReady.then((ready) => ready.send(message.message));
  });

  port.onDisconnect.addListener(() => {
    ports.delete(port);
    router.forget(port);
  });
});
