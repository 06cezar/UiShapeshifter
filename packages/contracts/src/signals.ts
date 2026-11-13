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

export interface AdaptationTrigger {
  id: string;
  rule: "small-targets" | "font-too-small" | "lost-in-navigation" | "frequent-path" | "unused-module";
  evidence: UsageSignal[];
  goal: string;              // scopul cu care pornește agentul, ex. „Utilizatorul ratează des butonul X: mărește țintele.”
  risk: "low" | "high";      // low + trust.autoApplyLowRisk => se aplică direct și se anunță; altfel propunere
  createdAt: string;
}
