// Accesibilitatea (specs/07): funcțiile de contrast, pragurile și auditul.
export * from "./contrast";
export * from "./thresholds";
export * from "./audit";
export { mergeFixes, proposeFix, withFixes } from "./fixes";
export { auditUiHandler, registerAuditTool } from "./audit-tool";
export { auditDom, collectDomFacts, effectiveBackground, factsOf } from "./dom";
