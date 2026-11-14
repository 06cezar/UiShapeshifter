// Memoria agentului despre utilizator: un profil în stilul unui ICP (ideal customer profile),
// dar pentru o singură persoană. Se umple din testul inițial, din conversație și din utilizare.
// Stocat pe server: data/profiles/<userId>.json. Detalii: specs/08-profil-si-memorie.md.

import type { LayoutTemplate, NavPosition } from "./ui-config";

export interface UserNeeds {
  minFontPx: number;                 // din testul de lizibilitate; niciodată sub 16
  contrast: "normal" | "high";
  minTargetPx: number;               // din testul de atingere; niciodată sub 44
  reducedMotion: boolean;
  prefersVoice: boolean;
}

export interface UserPreferences {
  navPosition?: NavPosition;
  template?: LayoutTemplate;
  familiarLayouts: LayoutTemplate[]; // din „ce aplicații folosești des”, traduse în structuri
  hiddenModules: string[];
  pinnedModules: string[];
}

/** Partea de „ICP”: cine e omul și ce face des. */
export interface Persona {
  ageRange?: "18-34" | "35-59" | "60-74" | "75+";
  techComfort: "low" | "medium" | "high";
  goals: string[];                   // ex. „vorbesc cu nepoata”, „văd pozele de la familie”
  frequentTasks: string[];           // ex. "openChat:ana", "sendPhoto"
  keyContacts: string[];             // contactId-uri
  painPoints: string[];              // ex. „nu găsesc butonul de trimis”
}

/** Un lucru învățat, cu dovezile lui. Agentul nu inventează fapte fără dovezi. */
export interface ProfileFact {
  id: string;
  statement: string;                 // ex. „Apasă des lângă butoane mici.”
  evidence: string[];                // id-uri de semnale, de pași din jurnal sau citate din conversație
  confidence: number;                // 0–1
  source: "onboarding" | "usage" | "conversation";
  createdAt: string;
  lastConfirmedAt?: string;
}

export interface TrustState {
  accepted: number;                  // propuneri păstrate
  undone: number;                    // propuneri anulate
  autoApplyLowRisk: boolean;         // devine true după 3 propuneri păstrate la rând (vezi specs/09)
}

/**
 * Ce îl deranjează pe om, în cuvinte pe care le recunoaște. Din testul inițial și din cereri.
 * „promos” = promoții și bannere din pagină; nu blocăm reclame la nivel de rețea (specs/00).
 */
export type PreferenceCategory =
  | "ai-features"   // rezumate, butoane și „moduri” AI din site-uri
  | "short-video"   // Shorts, Reels și rafturi de clipuri scurte
  | "stories"       // benzi de Stories
  | "promos"        // bannere și blocuri promoționale
  | "clutter"       // coloane de umplutură, boilerplate, funcții pe care nu le folosește
  | "popups"        // ferestre care apar peste pagină
  | "autoplay";     // redare automată

/**
 * O preferință care se aplică pe ORICE site, nu doar pe cel unde a fost spusă. Pe un site fără rețetă, agentul
 * o propune singur (Suggestion „general-preferences”); după „Păstrez” devine parte din rețeta site-ului.
 */
export interface GeneralPreference {
  id: string;
  category?: PreferenceCategory;
  /** Ce a vrut omul, pe scurt, în română (ex. „fără rezumate AI”); intră în scopul dat agentului. */
  text: string;
  source: "onboarding" | "conversation" | "usage";
  /** Id-uri de rulări sau citate scurte; ca la `ProfileFact`. */
  evidence: string[];
  createdAt: string;
  /** Pe ce site-uri s-a aplicat deja (host); o preferință nu se mai propune acolo. */
  appliedOn: string[];
  /**
   * Preferință de aspect cerută „peste tot” (ex. fundal verde): CSS-ul aplicat de agent, pe care extensia îl pune
   * singură pe orice site, fără AI (trece prin aceeași validare ca rețetele, C5). Fără selectori de site, doar
   * `html`, `body`, `*` și elemente generice. Lipsește la preferințele de ascuns (acelea le aplică regulile C4).
   */
  css?: string;
}

/** Un site pe care omul îl cunoaște bine: sursă pentru „fă-l să arate ca site-ul cu care sunt obișnuit”. */
export interface FamiliarSite {
  host: string;                      // fără „www.”, litere mici
  level: "daily" | "sometimes";
  /** Din testul inițial (omul l-a ales) sau dedus din utilizare. */
  source: "onboarding" | "conversation" | "usage";
}

export interface UserProfile {
  userId: string;
  displayName: string;
  createdAt: string;
  updatedAt: string;
  onboarding: { completed: boolean; skipped: boolean; at?: string };
  needs: UserNeeds;
  preferences: UserPreferences;
  persona: Persona;
  facts: ProfileFact[];
  trust: TrustState;
  /** Din etapa 3 (E8). Lipsește la profilurile vechi; se tratează ca listă goală. */
  generalPreferences?: GeneralPreference[];
  familiarSites?: FamiliarSite[];
}

export const DEFAULT_PROFILE_NEEDS: UserNeeds = {
  minFontPx: 16,
  contrast: "normal",
  minTargetPx: 44,
  reducedMotion: false,
  prefersVoice: false,
};

/** Ce trimite testul inițial la final (PUT /api/profile/:userId/onboarding). */
export interface OnboardingResult {
  skipped: boolean;
  needs?: Partial<UserNeeds>;
  preferences?: Partial<UserPreferences>;
  persona?: Partial<Persona>;
  /** Ce îl deranjează (pas nou al testului); serverul le face `generalPreferences` cu `source: "onboarding"`. */
  dislikes?: PreferenceCategory[];
  /** Site-urile pe care le cunoaște bine; serverul le face `familiarSites`. */
  familiarSites?: string[];
  answers: { questionId: string; answer: string | number | boolean }[];
}
