// Semnalele de utilizare (colectate în frontend) și declanșatoarele de adaptare automată (pe server).
// Regulile, fără AI: specs/09-semnale-si-adaptare.md.

export type UsageSignal =
  | { kind: "misclick"; ts: string; x: number; y: number; nearestElementId?: string; distancePx: number }
  | { kind: "zoom"; ts: string; scale: number }                       // ctrl+rotiță, ctrl+plus, pinch
  | { kind: "back_loop"; ts: string; moduleId: string; count: number } // intră și iese repetat din același loc
  | { kind: "dwell"; ts: string; moduleId: string; ms: number }        // a stat mult fără să facă nimic
  | { kind: "feature_use"; ts: string; elementId: string; action?: string }
  | { kind: "help_request"; ts: string; text?: string }
  | { kind: "proposal_decision"; ts: string; proposalId: string; decision: "keep" | "undo" };

/**
 * Pe site-uri, `moduleId` din `back_loop` și `dwell` e id-ul zonei din snapshot (`PageRegion.id`) sau calea paginii,
 * iar `nearestElementId` din `misclick` e id-ul din registru. Gazda vine în `ClientMessage.signals.page`.
 */

export type AdaptationRule =
  | "small-targets"
  | "font-too-small"
  | "lost-in-navigation"
  | "frequent-path"
  | "unused-module"
  | "general-preferences"  // site fără rețetă + omul are preferințe generale neaplicate acolo
  | "repeat-request";      // aceeași cerere pe ≥ 2 site-uri → propune să devină preferință generală

export interface AdaptationTrigger {
  id: string;
  rule: AdaptationRule;
  evidence: UsageSignal[];
  goal: string;              // scopul cu care pornește agentul, ex. „Utilizatorul ratează des butonul X: mărește țintele.”
  risk: "low" | "high";      // low + trust.autoApplyLowRisk => se aplică direct și se anunță; altfel propunere
  createdAt: string;
}

/**
 * O propunere făcută de mascotă fără să fi cerut omul: bulă discretă, fără fereastră care blochează.
 * Serverul o trimite (`ServerMessage.suggestion`); „Da” pornește o rulare cu `goal` (origin „adaptation”),
 * al cărei rezultat trece oricum prin Păstrez / Anulez. „Nu” se ține minte ca să nu se repete (specs/09).
 */
export interface Suggestion {
  id: string;
  trigger: AdaptationRule;
  /** Ce spune mascota, scurt, în română (ex. „Butoanele par greu de apăsat. Le măresc?”). */
  text: string;
  /** Scopul cu care pornește agentul dacă omul acceptă. */
  goal: string;
  risk: "low" | "high";
  /** Site-ul la care se referă; lipsește pentru propunerile valabile peste tot. */
  host?: string;
  createdAt: string;
}
