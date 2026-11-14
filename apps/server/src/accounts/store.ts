// Conturile opționale (E6, specs/08): fișiere JSON în data/accounts/, parola DOAR ca hash scrypt cu sare,
// token-urile doar ca sha256 (cine citește data/ nu poate intra în cont). Nimic din ele nu ajunge în loguri.

import { createHash, randomBytes, randomUUID, scrypt, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";
import { ACCOUNT_LIMITS, type AccountInfo } from "@uishapeshifter/contracts";
import { dataPath, isSafeId, readJson, writeJson } from "../storage/json-files";

const scryptAsync = promisify(scrypt) as (password: string, salt: Buffer, keylen: number) => Promise<Buffer>;

const ACCOUNTS_DIR = "accounts";
const TOKENS_FILE = "tokens.json";
const SALT_BYTES = 16;
const KEY_BYTES = 64;
const TOKEN_BYTES = 32;
/** Numele de utilizator: litere, cifre, „.”, „_” și „-”; nu ajunge în calea fișierului așa cum e scris (vezi fileOf). */
const USERNAME = /^[A-Za-z0-9._-]+$/;

interface StoredAccount extends AccountInfo {
  /** „scrypt$<sare hex>$<cheie hex>” */
  passwordHash: string;
  /** userId-ul sub care stau datele contului (profilul, rețetele). */
  userId: string;
}

export interface Account extends AccountInfo {
  userId: string;
}

export type AccountError = { status: 400 | 401 | 409; error: string };

/** Numele se compară fără majuscule: „Maria” și „maria” sunt același cont. */
const keyOf = (username: string) => username.trim().toLowerCase();
const fileOf = (username: string) =>
  dataPath(ACCOUNTS_DIR, `${createHash("sha256").update(keyOf(username)).digest("hex")}.json`);
const tokensFile = () => dataPath(ACCOUNTS_DIR, TOKENS_FILE);
const tokenKey = (token: string) => createHash("sha256").update(token).digest("hex");

export function checkCredentials(username: unknown, password: unknown): AccountError | null {
  if (typeof username !== "string" || typeof password !== "string") {
    return { status: 400, error: "Lipsește numele sau parola." };
  }
  const name = username.trim();
  if (
    name.length < ACCOUNT_LIMITS.usernameMinChars ||
    name.length > ACCOUNT_LIMITS.usernameMaxChars ||
    !USERNAME.test(name)
  ) {
    return {
      status: 400,
      error: `Numele are ${ACCOUNT_LIMITS.usernameMinChars}–${ACCOUNT_LIMITS.usernameMaxChars} caractere: litere, cifre, „.”, „_”, „-”.`,
    };
  }
  if (password.length < ACCOUNT_LIMITS.passwordMinChars || password.length > ACCOUNT_LIMITS.passwordMaxChars) {
    return { status: 400, error: `Parola are cel puțin ${ACCOUNT_LIMITS.passwordMinChars} caractere.` };
  }
  return null;
}

async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(SALT_BYTES);
  const key = await scryptAsync(password, salt, KEY_BYTES);
  return `scrypt$${salt.toString("hex")}$${key.toString("hex")}`;
}

async function passwordMatches(password: string, stored: string): Promise<boolean> {
  const [scheme, saltHex, keyHex] = stored.split("$");
  if (scheme !== "scrypt" || !saltHex || !keyHex) return false;
  const expected = Buffer.from(keyHex, "hex");
  const actual = await scryptAsync(password, Buffer.from(saltHex, "hex"), expected.length);
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

function publicPart(stored: StoredAccount): Account {
  return { accountId: stored.accountId, username: stored.username, createdAt: stored.createdAt, userId: stored.userId };
}

async function readAccount(username: string): Promise<StoredAccount | null> {
  return (await readJson(fileOf(username))) as StoredAccount | null;
}

export async function createAccount(
  username: string,
  password: string,
  userId: string,
): Promise<Account | AccountError> {
  if (!isSafeId(userId)) return { status: 400, error: "userId-ul anonim nu e valid." };
  if (await readAccount(username))
    return { status: 409, error: "Numele e deja folosit. Alege altul sau intră în cont." };
  const stored: StoredAccount = {
    accountId: `acc-${randomUUID().slice(0, 8)}`,
    username: username.trim(),
    createdAt: new Date().toISOString(),
    passwordHash: await hashPassword(password),
    userId,
  };
  await writeJson(fileOf(username), stored);
  return publicPart(stored);
}

export async function verifyAccount(username: string, password: string): Promise<Account | AccountError> {
  const stored = await readAccount(username);
  // Același mesaj pentru nume greșit și parolă greșită: nu spunem cine are cont.
  if (!stored || !(await passwordMatches(password, stored.passwordHash))) {
    return { status: 401, error: "Numele sau parola nu se potrivesc." };
  }
  return publicPart(stored);
}

/** Un token nou pentru cont; pe disc stă doar hash-ul lui. */
export async function issueToken(account: Account): Promise<string> {
  const token = randomBytes(TOKEN_BYTES).toString("hex");
  const tokens = ((await readJson(tokensFile())) ?? {}) as Record<string, Account>;
  tokens[tokenKey(token)] = account;
  await writeJson(tokensFile(), tokens);
  return token;
}

export async function accountOfToken(token: string | undefined): Promise<Account | null> {
  if (!token) return null;
  const tokens = ((await readJson(tokensFile())) ?? {}) as Record<string, Account>;
  return tokens[tokenKey(token)] ?? null;
}
