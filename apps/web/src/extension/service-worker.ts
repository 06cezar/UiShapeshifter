// Service worker-ul extensiei (Manifest V3): ține legătura cu serverul și duce mesajele între pagini și server.
// Paginile (content script) și popup-ul se leagă prin porturi; serverul vede o singură sesiune pentru tot browserul,
// iar mesajele unei rulări ajung în tab-ul din care a plecat cererea (`runId → tab`, specs/06).

import { SERVER_PORT, type ServerMessage } from "@uishapeshifter/contracts";
import { PAGE_PORT, POPUP_PORT, parseToWorker, type FromWorker } from "./messages";
import { createRunRouter } from "./run-router";
import { startServerLink, type ServerLink } from "./server-link";
import { getOrCreateSessionId, getOrCreateUserId } from "./storage";

/** Pus de build.mjs: true dacă pagina testului inițial (C3) e în build. */
declare const __UIS_ONBOARDING__: boolean;

// La instalare se deschide testul inițial (C3, specs/10): ce citește comod, ce îl deranjează, ce site-uri cunoaște.
// Rezultatul ajunge în chrome.storage.local („onboarding”) și pe server, de unde îl citesc fontul minim și agentul.
chrome.runtime.onInstalled.addListener(({ reason }) => {
  if (__UIS_ONBOARDING__ && reason === "install") {
    void chrome.tabs.create({ url: chrome.runtime.getURL("onboarding.html") });
  }
});

const SERVER_WS_URL = `ws://localhost:${SERVER_PORT}/ws`;

const pagePorts = new Set<chrome.runtime.Port>();
const popupPorts = new Set<chrome.runtime.Port>();
/** Tab-ul activ acum: aici lucrează rulările pornite de server (adaptarea, testul inițial), care n-au tab al lor. */
let activeTabId: number | undefined;
chrome.tabs.onActivated.addListener(({ tabId }) => (activeTabId = tabId));
// După o repornire a service worker-ului nu știm încă tab-ul activ: îl cerem o dată.
void chrome.tabs.query({ active: true, currentWindow: true }).then(([tab]) => (activeTabId ??= tab?.id));
const router = createRunRouter<chrome.runtime.Port>({
  activePort: () => [...pagePorts].find((port) => port.sender?.tab?.id === activeTabId),
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
  for (const port of router.targetsFor(message, pagePorts)) post(port, { type: "from_server", message });
}

const linkReady: Promise<ServerLink> = (async () => {
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
  return link;
})();

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
    void linkReady.then((ready) => ready.send(message.message));
  });

  port.onDisconnect.addListener(() => {
    ports.delete(port);
    router.forget(port);
  });
});
