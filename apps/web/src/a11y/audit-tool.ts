// Unealta audit_ui (specs/05, specs/07): auditul pe DOM-ul randat, cu reparațiile aplicabile cu patch_config.
// Rulează în browser, prin puntea lui B (agent-bridge): snapshot-ul complet din registru + faptele din DOM.
// Pragurile sunt cele din store (ale utilizatorului curent), deci auditul judecă exact ca poarta.

import type { AuditReport, ToolResult } from "@uishapeshifter/contracts";
import type { AgentBridge, ToolContext, ToolHandler } from "../agent-bridge";
import { auditDom } from "./dom";
import { withFixes } from "./fixes";

/** Argumentele de la model: `{}` sau `{ moduleId }`. Nimic altceva nu e acceptat, ca greșelile să se vadă. */
export function parseAuditArgs(args: unknown): { moduleId?: string } | undefined {
  if (args === undefined || args === null) return {};
  if (typeof args !== "object" || Array.isArray(args)) return undefined;
  const { moduleId, ...rest } = args as Record<string, unknown>;
  if (Object.keys(rest).length > 0) return undefined;
  if (moduleId === undefined) return {};
  return typeof moduleId === "string" && moduleId.trim() !== "" ? { moduleId } : undefined;
}

export const auditUiHandler: ToolHandler<"audit_ui"> = (args, ctx: ToolContext): ToolResult<AuditReport> => {
  const parsed = parseAuditArgs(args);
  if (!parsed) {
    return {
      ok: false,
      error: {
        code: "INVALID_ARGS",
        message: 'audit_ui primește {} sau { moduleId: text }, ex. { moduleId: "messages" }.',
      },
    };
  }
  const snapshot = ctx.registry.snapshot(parsed);
  const { config, thresholds } = ctx.store.getState();
  const report = auditDom(snapshot, thresholds, { moduleId: parsed.moduleId });
  return { ok: true, data: withFixes(report, snapshot, config) };
};

/** Înregistrează audit_ui pe punte; întoarce scoaterea. Se cheamă o dată, unde se montează aplicația. */
export function registerAuditTool(bridge: Pick<AgentBridge, "registerTool">): () => void {
  return bridge.registerTool("audit_ui", auditUiHandler);
}
