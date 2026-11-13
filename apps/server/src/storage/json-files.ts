// Stocarea serverului: fișiere JSON în data/ (fără bază de date, vezi specs/01).
// DATA_DIR se citește la fiecare apel, ca testele să poată lucra într-un folder temporar.

import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const DEFAULT_DATA_DIR = fileURLToPath(new URL("../../../../data", import.meta.url));

// userId, runId: doar litere, cifre, - și _, ca un id să nu poată ieși din folderul lui (../).
const SAFE_ID = /^[A-Za-z0-9_-]{1,64}$/;

export function isSafeId(id: string): boolean {
  return SAFE_ID.test(id);
}

export function dataPath(...parts: string[]): string {
  return join(process.env.DATA_DIR ?? DEFAULT_DATA_DIR, ...parts);
}

/** Citește un JSON; întoarce null dacă fișierul nu există. */
export async function readJson(path: string): Promise<unknown | null> {
  try {
    return JSON.parse(await readFile(path, "utf-8"));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw error;
  }
}

/** Scrie atomic (fișier temporar + rename), ca un cititor să nu prindă niciodată un JSON pe jumătate. */
export async function writeJson(path: string, value: unknown): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  const temporary = `${path}.${process.pid}.${Date.now()}.tmp`;
  await writeFile(temporary, JSON.stringify(value, null, 2), "utf-8");
  await rename(temporary, path);
}
