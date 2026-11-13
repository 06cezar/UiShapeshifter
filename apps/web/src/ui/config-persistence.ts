// Persistența config-ului (specs/02, regula 5; rutele din specs/06): la pornire GET profil + GET config, la fiecare
// schimbare PUT cu debounce. Aplicația merge și fără server sau fără rute: orice eșec cade pe valorile implicite,
// iar o salvare eșuată se notează o dată în consolă, fără să oprească interfața.

import { CONTRACT_VERSION, DEFAULT_CONFIG, DEFAULT_PROFILE_NEEDS } from "@uishapeshifter/contracts";
import type { UIConfig, UserNeeds } from "@uishapeshifter/contracts";
import { validateConfigShape } from "./config-shape";
import type { ConfigStore } from "./config-store";

/** Regula 5: config-ul se trimite la cel mult o secundă după ultima schimbare. */
export const SAVE_DEBOUNCE_MS = 1000;
/** Utilizatorul demo-ului (specs/12); `?user=demo-fresh` pornește testul inițial. */
export const DEFAULT_USER_ID = "maria";
const USER_PARAM = "user";
/** Ce acceptă și serverul în cale (A: config, E: profil): litere, cifre, cratimă. */
const SAFE_USER_ID = /^[A-Za-z0-9-]{1,64}$/;

type FetchFn = (input: string, init?: RequestInit) => Promise<Response>;

export function userIdFromSearch(search: string): string {
  const requested = new URLSearchParams(search).get(USER_PARAM);
  return requested && SAFE_USER_ID.test(requested) ? requested : DEFAULT_USER_ID;
}

export interface InitialConfig {
  config: UIConfig;
  needs: UserNeeds;
  /** De unde a venit fiecare parte, pentru jurnal și depanare. */
  source: { config: "server" | "default"; needs: "server" | "default" };
}

export interface LoadDeps {
  apiUrl: string;
  /** Ajustarea după profil (configForNeeds din a11y-binding.ts). */
  adjust: (config: UIConfig, needs: UserNeeds) => UIConfig;
  fetchFn?: FetchFn;
}

/** Config-ul de pornire: cel salvat sau DEFAULT_CONFIG, în ambele cazuri ajustat după nevoile din profil. */
export async function loadInitialConfig(userId: string, deps: LoadDeps): Promise<InitialConfig> {
  const fetchFn = deps.fetchFn ?? fetch;
  const id = encodeURIComponent(userId);
  const [profile, saved] = await Promise.all([
    getJson(fetchFn, `${deps.apiUrl}/profile/${id}`),
    getJson(fetchFn, `${deps.apiUrl}/config/${id}`),
  ]);
  const savedNeeds = isRecord(profile) ? profile.needs : undefined;
  const needs = isUserNeeds(savedNeeds) ? savedNeeds : DEFAULT_PROFILE_NEEDS;
  const config = isCurrentConfig(saved) ? saved : undefined;
  return {
    config: deps.adjust(config ?? DEFAULT_CONFIG, needs),
    needs,
    source: { config: config ? "server" : "default", needs: needs === savedNeeds ? "server" : "default" },
  };
}

export interface SaveDeps {
  apiUrl: string;
  fetchFn?: FetchFn;
  delayMs?: number;
  onError?: (error: unknown) => void;
}

/** Trimite config-ul după fiecare schimbare (debounce). Întoarce oprirea: dezabonare și anularea salvării în așteptare. */
export function startConfigSaver(store: ConfigStore, userId: string, deps: SaveDeps): () => void {
  const fetchFn = deps.fetchFn ?? fetch;
  const delayMs = deps.delayMs ?? SAVE_DEBOUNCE_MS;
  const url = `${deps.apiUrl}/config/${encodeURIComponent(userId)}`;
  let warned = false;
  const onError =
    deps.onError ??
    ((error: unknown) => {
      if (warned) return;
      warned = true;
      console.warn("[ui] Config-ul nu s-a putut salva; interfața merge mai departe fără salvare.", error);
    });
  let timer: ReturnType<typeof setTimeout> | undefined;

  const save = async () => {
    timer = undefined;
    try {
      const res = await fetchFn(url, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(store.getState().config),
      });
      if (!res.ok) onError(new Error(`PUT ${url}: ${res.status}`));
    } catch (error) {
      onError(error);
    }
  };

  const unsubscribe = store.subscribe((state, previous) => {
    // Doar schimbările de config: ecranul curent și meniurile deschise nu se salvează.
    if (state.config === previous.config) return;
    clearTimeout(timer);
    timer = setTimeout(save, delayMs);
  });

  return () => {
    unsubscribe();
    clearTimeout(timer);
  };
}

/** JSON-ul răspunsului, sau `undefined` la orice eșec (rețea, 4xx/5xx, corp care nu e JSON). */
async function getJson(fetchFn: FetchFn, url: string): Promise<unknown> {
  try {
    const res = await fetchFn(url);
    return res.ok ? await res.json() : undefined;
  } catch {
    return undefined;
  }
}

/**
 * Un config salvat îl folosim doar dacă are forma corectă și e scris pentru contractul de acum: unul de altă
 * versiune poate avea câmpuri cu alt sens, deci pornim de la DEFAULT_CONFIG (ajustat după profil).
 */
function isCurrentConfig(saved: unknown): saved is UIConfig {
  return (
    saved !== undefined && validateConfigShape(saved).length === 0 && (saved as UIConfig).version === CONTRACT_VERSION
  );
}

/** Profilul vine de pe server: îl folosim doar dacă `needs` are exact forma din contracte. */
function isUserNeeds(value: unknown): value is UserNeeds {
  if (!isRecord(value)) return false;
  const finite = (v: unknown) => typeof v === "number" && Number.isFinite(v);
  return (
    finite(value.minFontPx) &&
    (value.contrast === "normal" || value.contrast === "high") &&
    finite(value.minTargetPx) &&
    typeof value.reducedMotion === "boolean" &&
    typeof value.prefersVoice === "boolean"
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
