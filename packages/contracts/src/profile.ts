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
  answers: { questionId: string; answer: string | number | boolean }[];
}
