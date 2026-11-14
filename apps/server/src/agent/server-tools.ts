// Uneltele care rulează pe server (TOOL_RUNS_ON === "server"): finish și profilul (store-ul lui E, specs/08).
// Folosim instanța comună `profileStore`, ca salvările agentului și ale rutelor să treacă prin aceeași coadă.

import type { ToolArgs, ToolName, ToolResult, UserProfile } from "@uishapeshifter/contracts";
import { applyProfileUpdate, profileStore, type ProfileStore } from "../profile";

const GENERAL_PREFERENCES_PATH = "/generalPreferences";

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

function touchesGeneralPreferences(args: ToolArgs["update_profile"]): boolean {
  return (args.patch ?? []).some((op) => typeof op?.path === "string" && op.path.startsWith(GENERAL_PREFERENCES_PATH));
}

async function updateProfile(userId: string, args: unknown, store: ProfileStore): Promise<ToolResult> {
  const parsed = updateProfileArgs(args);
  if (typeof parsed === "string") return invalidArgs(parsed);
  const updated = applyProfileUpdate(await store.get(userId), parsed, new Date().toISOString());
  if (!updated.ok) return invalidArgs(updated.error);
  const saved: UserProfile = await store.save(updated.value);
  // Validarea profilului păstrează preferințele generale abia din E8; până atunci spunem clar că nu s-a reținut,
  // în loc ca modelul să creadă că omul nu mai trebuie să repete.
  if (touchesGeneralPreferences(parsed) && !saved.generalPreferences?.length) {
    return {
      ok: false,
      error: {
        code: "INTERNAL",
        message: "Preferința generală nu s-a putut păstra încă (profilul extins vine în E8). Faptele s-au salvat.",
      },
    };
  }
  return { ok: true, data: { updatedAt: saved.updatedAt } };
}

async function runServerTool(
  runId: string,
  userId: string,
  name: ToolName,
  args: unknown,
  store: ProfileStore,
): Promise<ToolResult> {
  switch (name) {
    case "finish":
      return { ok: true, data: { runId } };
    case "get_profile":
      return { ok: true, data: await store.get(userId) };
    case "update_profile":
      return updateProfile(userId, args, store);
    default:
      return invalidArgs(`Unealta ${name} nu rulează pe server.`);
  }
}

export async function callServerTool(
  runId: string,
  userId: string,
  name: ToolName,
  args: unknown,
  store: ProfileStore = profileStore,
): Promise<ToolResult> {
  try {
    return await runServerTool(runId, userId, name, args, store);
  } catch (error) {
    // ex. disc plin: modelul află că profilul n-a mers și continuă fără el; rularea nu cade
    console.error(`agent: ${name} a căzut:`, error);
    return { ok: false, error: { code: "INTERNAL", message: "Profilul nu e disponibil acum. Continuă fără el." } };
  }
}
