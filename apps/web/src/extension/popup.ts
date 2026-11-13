// Popup-ul extensiei (butonul din bara browserului). În etapa 0 arată legătura cu serverul și userId-ul anonim;
// „pornit/oprit pe site” și „Revino la original” vin cu rețetele (B5), contul cu E6.

import { POPUP_PORT, parseFromWorker, type LinkStatus } from "./messages";

const STATUS_TEXT: Record<LinkStatus, string> = {
  connecting: "Se conectează la server…",
  open: "Conectat la server",
  closed: "Serverul nu răspunde (pornește-l cu npm run dev)",
};

const dot = document.getElementById("dot")!;
const statusText = document.getElementById("status")!;
const userText = document.getElementById("user")!;

const port = chrome.runtime.connect({ name: POPUP_PORT });
port.onMessage.addListener((raw) => {
  const message = parseFromWorker(raw);
  if (message?.type !== "status") return;
  dot.dataset.status = message.status;
  statusText.textContent = STATUS_TEXT[message.status];
  userText.textContent = message.userId ?? "–";
});
port.postMessage({ type: "get_status" });
