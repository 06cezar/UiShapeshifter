// Contul opțional: fără el totul rămâne pe dispozitiv; cu el, profilul și rețetele trec pe alt dispozitiv.
// Regulile (legarea datelor anonime, îmbinarea, parola ca hash): specs/08-profil-si-memorie.md, „Conturi”.
// Rute HTTP: specs/06-protocol.md. Cod: apps/server/src/accounts/ (E6), apps/web/src/sync/ (E6).

import type { UserProfile } from "./profile";
import type { SiteRecipe } from "./site-recipe";

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

/** Tot ce se sincronizează: ce are omul și ce a refăcut pe site-uri. */
export interface SyncBundle {
  profile: UserProfile;
  recipes: SiteRecipe[];
  updatedAt: string;
}
