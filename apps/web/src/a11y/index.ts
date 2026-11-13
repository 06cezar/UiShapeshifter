// Accesibilitatea (specs/07): funcțiile de contrast, pragurile și auditul.
export * from "./contrast";
export * from "./thresholds";
export * from "./audit";
export { auditDom, collectDomFacts, effectiveBackground, factsOf } from "./dom";
// Pe pagina unui site (C2): auditul, reparațiile ca CSS, ce a adus agentul și unealta audit_ui.
export {
  auditPage,
  MAX_AUDITED_ELEMENTS,
  type PageAudit,
  type PageAuditOptions,
  type PageIdentity,
} from "./page-audit";
export { fixCssFor, withFixCss } from "./fix-css";
export { auditWithoutRecipe, introducedIssues, type PauseRecipe } from "./introduced";
export { parseAuditArgs, runAuditUi, type AuditToolDeps } from "./audit-tool";
// Preferințele de bază fără AI, pe orice site (C4).
export {
  BASE_STYLE_ID,
  startBasePreferences,
  type BasePreferences,
  type BasePreferencesOptions,
} from "./base-preferences";
