// Service worker-ul extensiei (Manifest V3): ține legătura cu serverul și duce mesajele între pagini și server.
// Paginile (content script) și popup-ul se leagă prin porturi; serverul vede o singură sesiune pentru tot browserul.

import { SERVER_PORT, type ServerMessage } from "@uishapeshifter/contracts";
import { PAGE_PORT, POPUP_PORT, parseToWorker, type FromWorker, type LinkStatus } from "./messages";
import { startServerLink, type ServerLink } from "./server-link";
import { getOrCreateSessionId, getOrCreateUserId } from "./storage";

const SERVER_WS_URL = `ws://localhost:${SERVER_PORT}/ws`;

const pagePorts = new Set<chrome.runtime.Port>();
const popupPorts = new Set<chrome.runtime.Port>();
/** Pagina care a vorbit ultima cu serverul: răspunsurile rulării (tool_call, step…) merg la ea. */
let activePage: chrome.runtime.Port | null = null;
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
  // Până la etapa 2 avem o singură rulare odată, deci totul merge la pagina activă; fără ea, la toate.
  const targets = activePage && pagePorts.has(activePage) ? [activePage] : [...pagePorts];
  for (const port of targets) post(port, { type: "from_server", message });
}

const linkReady: Promise<ServerLink> = (async () => {
  userId = await getOrCreateUserId(chrome.storage.local);
  const sessionId = await getOrCreateSessionId(chrome.storage.local);
  link = startServerLink({
    url: SERVER_WS_URL,
    userId,
    sessionId,
    onMessage: routeFromServer,
    onStatus: (_status: LinkStatus) => broadcastStatus(),
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
    if (port.name === PAGE_PORT) activePage = port;
    void linkReady.then((ready) => ready.send(message.message));
  });

  port.onDisconnect.addListener(() => {
    ports.delete(port);
    if (activePage === port) activePage = null;
  });
});
