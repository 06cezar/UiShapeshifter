// Executorul uneltelor „web” în pagina unui site (etapa 1, specs/05 și 06): primește tool_call de la server, întoarce
// tool_result. get_page_snapshot îl face registrul (B2), apply_css motorul de rețete (B5), say bula mascotei (D).

import type { ApplyCssData, PageSnapshot, ToolName, ToolResult } from "@uishapeshifter/contracts";
import type { PageRegistry } from "../ui/page-registry/registry";

/** Motorul de rețete, așa cum îl vede executorul (îl implementează B5). */
export interface CssApplier {
  applyCss(args: {
    css: string;
    mode?: "append" | "replace";
    reason: string;
    runId?: string;
  }): Promise<ToolResult<ApplyCssData>>;
}

export interface PageToolDeps {
  registry: PageRegistry;
  recipes?: CssApplier;
  /** Arată mesajul agentului (bula mascotei, D3); fără ea, îl ignorăm, dar răspundem „shown”. */
  say?(message: string): void;
}

function fail(code: "INVALID_ARGS" | "INTERNAL" | "ELEMENT_NOT_FOUND", message: string): ToolResult<never> {
  return { ok: false, error: { code, message } };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export async function runPageTool(
  name: ToolName,
  args: unknown,
  deps: PageToolDeps,
  runId?: string,
): Promise<ToolResult> {
  const a = isRecord(args) ? args : {};
  try {
    switch (name) {
      case "get_page_snapshot": {
        const regionId = typeof a.regionId === "string" ? a.regionId : undefined;
        const snapshot: PageSnapshot = deps.registry.snapshot({ regionId });
        if (regionId && !snapshot.regions.some((region) => region.id === regionId)) {
          return fail(
            "ELEMENT_NOT_FOUND",
            `Zona ${regionId} nu există. Zonele sunt în regions din snapshot-ul întreg.`,
          );
        }
        return { ok: true, data: snapshot };
      }
      case "apply_css": {
        if (typeof a.css !== "string" || typeof a.reason !== "string") {
          return fail("INVALID_ARGS", "apply_css cere css (text) și reason (o propoziție).");
        }
        if (a.mode !== undefined && a.mode !== "append" && a.mode !== "replace") {
          return fail("INVALID_ARGS", "mode e „append” sau „replace”.");
        }
        if (!deps.recipes) return fail("INTERNAL", "Motorul de rețete nu e încă pornit în pagină.");
        return await deps.recipes.applyCss({ css: a.css, mode: a.mode, reason: a.reason, runId });
      }
      case "say": {
        if (typeof a.message !== "string") return fail("INVALID_ARGS", "say cere message.");
        deps.say?.(a.message);
        return { ok: true, data: { shown: true } };
      }
      default:
        return fail("INVALID_ARGS", `Unealta ${name} nu rulează în pagina unui site în etapa asta.`);
    }
  } catch (error) {
    return fail(
      "INTERNAL",
      `Unealta ${name} a eșuat în pagină: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}
