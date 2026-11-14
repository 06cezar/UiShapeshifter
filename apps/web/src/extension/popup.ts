// Popup-ul extensiei (butonul din bara browserului): legătura cu serverul, userId-ul anonim și „Revino la original”
// pentru site-ul din tab-ul curent (B5). Contul vine cu E6.

import { currentAccount, signIn, signOut } from "../sync/account-sync";
import { clearRecipe, loadRecipe } from "../ui/recipes/recipe-store";
import { isExcluded, toggleExcluded } from "./excluded-sites";
import { POPUP_PORT, parseFromWorker, type LinkStatus } from "./messages";
import { normalizeHost } from "./page-info";
import { savedChangesText } from "./popup-text";

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

// ---------- „Revino la original” pentru site-ul din tab-ul curent ----------

const siteText = document.getElementById("site")!;
const resetButton = document.getElementById("reset") as HTMLButtonElement;
const resetStatus = document.getElementById("reset-status")!;

async function currentHost(): Promise<string | null> {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.url?.startsWith("http")) return null;
  return normalizeHost(new URL(tab.url).hostname);
}

async function showSite() {
  const host = await currentHost();
  if (!host) {
    siteText.textContent = "Pagina asta nu e un site obișnuit.";
    resetButton.disabled = true;
    return;
  }
  const { recipe } = await loadRecipe(chrome.storage.local, host, new Date().toISOString());
  siteText.textContent =
    recipe.revision > 0 ? `${host}: ${savedChangesText(recipe.revision)}.` : `${host}: nicio schimbare salvată.`;
  resetButton.disabled = recipe.revision === 0;
}

resetButton.addEventListener("click", async () => {
  const host = await currentHost();
  if (!host) return;
  // Tab-urile site-ului aud ștergerea (storage.onChanged) și scot foaia pe loc.
  await clearRecipe(chrome.storage.local, host);
  resetStatus.textContent = "Gata: site-ul arată din nou ca la început.";
  await showSite();
});

void showSite();

// ---------- Contul opțional (E6): fără cont totul rămâne local; cu cont, datele te urmează pe alt dispozitiv ----------

const API_URL = "http://localhost:8787/api";
const accountForm = document.getElementById("account-form") as HTMLFormElement;
const accountSigned = document.getElementById("account-signed")!;
const accountStatus = document.getElementById("account-status")!;
const signOutButton = document.getElementById("sign-out") as HTMLButtonElement;
const registerButton = document.getElementById("register") as HTMLButtonElement;
const usernameInput = document.getElementById("username") as HTMLInputElement;
const passwordInput = document.getElementById("password") as HTMLInputElement;

async function showAccount() {
  const account = await currentAccount(chrome.storage.local);
  accountForm.hidden = account !== null;
  accountSigned.hidden = signOutButton.hidden = account === null;
  if (account)
    accountSigned.textContent = `Ești în cont ca ${account.account.username}. Preferințele se sincronizează.`;
}

async function submit(mode: "register" | "login") {
  if (!accountForm.reportValidity()) return;
  accountStatus.textContent = mode === "register" ? "Creez contul…" : "Intru în cont…";
  const result = await signIn(mode, usernameInput.value, passwordInput.value, {
    apiUrl: API_URL,
    storage: chrome.storage.local,
  });
  passwordInput.value = ""; // parola nu rămâne nici în pagină
  accountStatus.textContent = result.ok ? "Gata: preferințele tale sunt aici." : result.error;
  await showAccount();
}

accountForm.addEventListener("submit", (event) => {
  event.preventDefault();
  void submit("login");
});
registerButton.addEventListener("click", () => void submit("register"));
signOutButton.addEventListener("click", async () => {
  await signOut(chrome.storage.local);
  accountStatus.textContent = "Ai ieșit din cont. Datele rămân pe acest calculator.";
  await showAccount();
});

void showAccount();

// ---------- „Nu schimba acest site”: fontul minim, ascunderile și rețeta se opresc pe site ----------

const excludeButton = document.getElementById("exclude") as HTMLButtonElement;
const excludeStatus = document.getElementById("exclude-status")!;

function showExcluded(excluded: boolean) {
  excludeButton.textContent = excluded ? "Schimbă din nou acest site" : "Nu schimba acest site";
  excludeStatus.textContent = excluded ? "Aici nu schimb nimic singur. Chatul rămâne, dacă vrei ceva." : "";
  resetButton.hidden = excluded;
}

async function showExcludeState() {
  const host = await currentHost();
  excludeButton.disabled = host === null;
  if (host) showExcluded(await isExcluded(chrome.storage.local, host));
}

excludeButton.addEventListener("click", async () => {
  const host = await currentHost();
  if (!host) return;
  showExcluded(await toggleExcluded(chrome.storage.local, host));
  // Pagina se reîncarcă: pornește fie neatinsă, fie cu tot ce avea (rețeta rămâne salvată).
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (tab?.id !== undefined) await chrome.tabs.reload(tab.id);
});

void showExcludeState();
