// Stocarea profilurilor: câte un fișier JSON pe utilizator, data/profiles/<userId>.json (git-ignored).
// Fără bază de date (specs/01). Scrierea trece printr-un fișier temporar, ca un crash să nu lase JSON pe jumătate.

import { randomUUID } from "node:crypto";
import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import type { UserProfile } from "@uishapeshifter/contracts";
import { createStartingProfile } from "./defaults";
import { isValidUserId, parseProfile } from "./validate";

/** apps/server/src/profile/ -> rădăcina repo-ului -> data/profiles/ */
export const DEFAULT_PROFILES_DIR = fileURLToPath(new URL("../../../../data/profiles/", import.meta.url));

export interface ProfileStore {
  /** Profilul salvat; dacă lipsește (sau fișierul e stricat), îl creează pe cel de pornire și îl salvează. */
  get(userId: string): Promise<UserProfile>;
  save(profile: UserProfile): Promise<UserProfile>;
  /** Șterge tot ce se știe și întoarce profilul de pornire („Ce știe vulpița despre mine” → Șterge). */
  reset(userId: string): Promise<UserProfile>;
}

function assertUserId(userId: string): void {
  if (!isValidUserId(userId)) throw new Error(`userId invalid: ${userId}`);
}

function isMissingFile(error: unknown): boolean {
  return error instanceof Error && "code" in error && error.code === "ENOENT";
}

export function createProfileStore(
  dir: string = DEFAULT_PROFILES_DIR,
  clock: () => Date = () => new Date(),
): ProfileStore {
  const fileOf = (userId: string) => join(dir, `${userId}.json`);

  // Scrierile aceluiași profil merg pe rând: agentul (update_profile) și Setările (PUT) pot salva în același timp,
  // iar pe Windows două redenumiri simultane peste același fișier dau EPERM.
  const writesInFlight = new Map<string, Promise<unknown>>();
  function oneAtATime<T>(userId: string, write: () => Promise<T>): Promise<T> {
    const previous = writesInFlight.get(userId) ?? Promise.resolve();
    const next = previous.catch(() => undefined).then(write);
    writesInFlight.set(userId, next);
    const forget = () => {
      if (writesInFlight.get(userId) === next) writesInFlight.delete(userId);
    };
    next.then(forget, forget);
    return next;
  }

  async function writeProfile(profile: UserProfile): Promise<UserProfile> {
    const saved = { ...profile, updatedAt: clock().toISOString() };
    await mkdir(dir, { recursive: true });
    // Nume unic pe fiecare salvare, ca un fișier temporar rămas după un crash să nu încurce următoarea.
    const tmp = `${fileOf(profile.userId)}.${randomUUID()}.tmp`;
    await writeFile(tmp, JSON.stringify(saved, null, 2) + "\n", "utf8");
    await rename(tmp, fileOf(profile.userId));
    return saved;
  }

  function save(profile: UserProfile): Promise<UserProfile> {
    assertUserId(profile.userId);
    return oneAtATime(profile.userId, () => writeProfile(profile));
  }

  function reset(userId: string): Promise<UserProfile> {
    assertUserId(userId);
    return oneAtATime(userId, async () => {
      await rm(fileOf(userId), { force: true });
      return writeProfile(createStartingProfile(userId, clock().toISOString()));
    });
  }

  async function get(userId: string): Promise<UserProfile> {
    assertUserId(userId);
    let text: string;
    try {
      text = await readFile(fileOf(userId), "utf8");
    } catch (error) {
      if (isMissingFile(error)) return reset(userId);
      throw error;
    }

    let raw: unknown;
    try {
      raw = JSON.parse(text);
    } catch {
      raw = undefined;
    }
    const parsed = parseProfile(raw);
    if (parsed.ok && parsed.value.userId === userId) return parsed.value;

    // Un fișier stricat nu trebuie să oprească demo-ul: îl păstrăm alături pentru depanare și pornim din nou.
    console.warn(`profile: ${userId}.json e invalid (${parsed.ok ? "alt userId" : parsed.error}); îl refac`);
    await rename(fileOf(userId), `${fileOf(userId)}.bad`).catch(() => undefined);
    return reset(userId);
  }

  return { get, save, reset };
}
