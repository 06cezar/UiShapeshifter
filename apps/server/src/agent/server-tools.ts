// Uneltele care rulează pe server (TOOL_RUNS_ON === "server").
// get_profile / update_profile se leagă de profilul lui E (E1) în A3; până atunci întorc o eroare clară.

import type { ToolName, ToolResult } from "@uishapeshifter/contracts";

export function callServerTool(runId: string, name: ToolName, _args: unknown): ToolResult {
  switch (name) {
    case "finish":
      return { ok: true, data: { runId } };
    case "get_profile":
    case "update_profile":
      return {
        ok: false,
        error: { code: "INTERNAL", message: "Profilul nu e încă legat de agent. Continuă fără el." },
      };
    default:
      return {
        ok: false,
        error: { code: "INVALID_ARGS", message: `Unealta ${name} nu rulează pe server.` },
      };
  }
}
