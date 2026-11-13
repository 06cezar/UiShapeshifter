// Uneltele care rulează pe server (TOOL_RUNS_ON === "server"): profilul (store-ul lui E, specs/08) și finish.

import type { ToolArgs, ToolName, ToolResult } from "@uishapeshifter/contracts";
import { applyProfileUpdate, createProfileStore } from "../profile";
import { dataPath } from "../storage/json-files";

/** Același folder ca rutele lui E (data/profiles), dar respectă DATA_DIR, ca testele să nu scrie în repo. */
export const profiles = createProfileStore(dataPath("profiles"));

function invalidArgs(message: string): ToolResult {
  return { ok: false, error: { code: "INVALID_ARGS", message } };
}

/** Argumentele vin de la model: verificăm forma înainte de applyProfileUpdate (care validează conținutul). */
function updateProfileArgs(args: unknown): ToolArgs["update_profile"] | string {
  const { facts, patch } = (args ?? {}) as Record<string, unknown>;
  if (facts !== undefined && !Array.isArray(facts)) return "facts trebuie să fie o listă de fapte.";
  if (patch !== undefined && !Array.isArray(patch)) return "patch trebuie să fie o listă de operații JSON Patch.";
  if (!facts?.length && !patch?.length) return "Trimite cel puțin un fapt (cu dovezi) sau o operație patch.";
  return { facts, patch } as ToolArgs["update_profile"];
}

export async function callServerTool(
  runId: string,
  userId: string,
  name: ToolName,
  args: unknown,
): Promise<ToolResult> {
  try {
    return await runServerTool(runId, userId, name, args);
  } catch (error) {
    // ex. disc plin: modelul află că profilul n-a mers și continuă fără el, rularea nu cade
    console.error(`agent: ${name} a căzut:`, error);
    return { ok: false, error: { code: "INTERNAL", message: "Profilul nu e disponibil acum. Continuă fără el." } };
  }
}

async function runServerTool(runId: string, userId: string, name: ToolName, args: unknown): Promise<ToolResult> {
  switch (name) {
    case "finish":
      return { ok: true, data: { runId } };
    case "get_profile":
      return { ok: true, data: await profiles.get(userId) };
    case "update_profile": {
      const parsed = updateProfileArgs(args);
      if (typeof parsed === "string") return invalidArgs(parsed);
      const updated = applyProfileUpdate(await profiles.get(userId), parsed, new Date().toISOString());
      if (!updated.ok) return invalidArgs(updated.error);
      const saved = await profiles.save(updated.value);
      return { ok: true, data: { updatedAt: saved.updatedAt } };
    }
    default:
      return invalidArgs(`Unealta ${name} nu rulează pe server.`);
  }
}
