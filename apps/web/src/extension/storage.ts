// Stocarea extensiei: userId-ul anonim în chrome.storage.local (generat o dată, la instalare) și sessionId-ul în
// chrome.storage.session (unul pe service worker).
// Fără cont totul stă aici (specs/01, „Salvare: local întâi”); profilul și rețetele vin în etapele următoare.

const USER_ID_KEY = "userId";
const SESSION_ID_KEY = "sessionId";

/** Orice ține chei/valori asincron: chrome.storage.local în extensie, un obiect în teste. */
export interface KeyValueStore {
  get(keys: string | string[]): Promise<Record<string, unknown>>;
  set(items: Record<string, unknown>): Promise<void>;
}

async function getOrCreate(store: KeyValueStore, key: string, create: () => string): Promise<string> {
  const saved = (await store.get(key))[key];
  if (typeof saved === "string" && saved.length > 0) return saved;
  const value = create();
  await store.set({ [key]: value });
  return value;
}

/** userId anonim, de forma „u-<8 caractere>”: trece de validarea profilului (litere, cifre, cratimă). */
export function getOrCreateUserId(store: KeyValueStore): Promise<string> {
  return getOrCreate(store, USER_ID_KEY, () => `u-${crypto.randomUUID().slice(0, 8)}`);
}

/**
 * Un sessionId pe service worker (specs/06), ținut în chrome.storage.session: rămâne același când MV3 oprește și
 * repornește worker-ul, ca serverul să lege socket-ul nou de rularea în curs; la repornirea browserului e altul.
 */
export function getOrCreateSessionId(store: KeyValueStore): Promise<string> {
  return getOrCreate(store, SESSION_ID_KEY, () => crypto.randomUUID());
}
