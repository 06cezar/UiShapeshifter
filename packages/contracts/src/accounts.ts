// Contul opțional: fără el totul rămâne pe dispozitiv; cu el, profilul și rețetele trec pe alt dispozitiv.
// Regulile (legarea datelor anonime, îmbinarea, parola ca hash): specs/08-profil-si-memorie.md, „Conturi”.
// Rute HTTP: specs/06-protocol.md. Cod: apps/server/src/accounts/ (E6), apps/web/src/sync/ (E6).

import type { UserProfile } from "./profile";
import type { RecipeRevision, SiteRecipe } from "./site-recipe";

export const ACCOUNT_LIMITS = {
  usernameMinChars: 3,
  usernameMaxChars: 32,
  passwordMinChars: 8,
  passwordMaxChars: 128,
} as const;

/** Ce vede extensia despre cont; niciodată parola sau hash-ul ei. */
export interface AccountInfo {
  accountId: string;
  username: string;
  createdAt: string;
}

export interface RegisterRequest {
  username: string;
  password: string;
  /** `userId`-ul anonim de pe acest dispozitiv: datele lui se leagă de cont (se îmbină, nu se pierd). */
  anonymousUserId: string;
}

export type LoginRequest = RegisterRequest;

export interface AuthResult {
  /** Token opac, pus de extensie în `Authorization: Bearer …` și ținut în `chrome.storage.local`. */
  token: string;
  account: AccountInfo;
  /** `userId`-ul sub care sunt datele contului. Extensia îl ia ca `userId` activ după login. */
  userId: string;
}

export const SYNC_LIMITS = {
  /**
   * Mărimea maximă a unui `SyncBundle` (JSON, în octeți UTF-8). Sub limita de 1 MB a corpurilor primite de server
   * (`express.json` în apps/server/src/server.ts), cu loc pentru antete și rotunjiri. Fiecare revizie poartă foaia
   * întreagă (până la `RECIPE_LIMITS.maxCssBytes`), deci istoricul e partea care crește; peste limită se scurtează el.
   */
  maxBundleBytes: 900_000,
} as const;

/**
 * Tot ce se sincronizează: ce are omul și ce a refăcut pe site-uri.
 * Mărimea: cel mult `SYNC_LIMITS.maxBundleBytes`. Dacă ar trece, clientul scurtează `history` (reviziile cu `revision`
 * cel mai mic întâi) înainte să renunțe la sincronizare; `profile` și `recipes` au prioritate și nu se taie.
 */
export interface SyncBundle {
  profile: UserProfile;
  recipes: SiteRecipe[];
  /**
   * Istoricul rețetelor pe site, ca „Anulez” pe o cerere din istoric să meargă și pe alt dispozitiv.
   * Absent la `PUT /api/sync` (client vechi): serverul păstrează istoricul pe care îl are. Prezent: se îmbină pe gazdă (mai jos).
   * Invarianți: cel mult o intrare pe `host`; fiecare `host` are rețetă în `recipes` (istoricul unei gazde fără rețetă,
   * ex. după „Revino la original”, se aruncă); cel mult `RECIPE_LIMITS.maxRevisions` revizii pe gazdă.
   * Îmbinarea: istoricul urmează rețeta. Câștigă rețeta cu `updatedAt` mai nou, iar istoricul gazdei se ia întreg din
   * aceeași parte; nu se amestecă revizii de pe două dispozitive.
   */
  history?: SiteRecipeHistory[];
  updatedAt: string;
}

/** Reviziile unei gazde; cea mai veche are `revision` cel mai mic. Invarianții: `SyncBundle.history`. */
export interface SiteRecipeHistory {
  host: string;
  revisions: RecipeRevision[];
}
