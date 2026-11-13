// Executorul uneltelor „web” în pagina unui site (etapa 1, specs/05 și 06): primește tool_call de la server, întoarce
// tool_result. get_page_snapshot îl face registrul (B2), apply_css motorul de rețete (B5), say bula mascotei (D),
// point_at mascota (D2), care merge la elementul găsit în registru.

import type { ApplyCssData, PageSnapshot, ToolData, ToolName, ToolResult } from "@uishapeshifter/contracts";
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
  /** Auditul de accesibilitate al paginii (C2, runAuditUi), legat în content script cu registrul și rețeta. */
  audit?(args: unknown): ToolResult;
  /** Arată mesajul agentului (bula mascotei, D3); fără ea, îl ignorăm, dar răspundem „shown”. */
  say?(message: string): void;
  /** Mascota merge la element și îl arată (D2); întoarce NOT_VISIBLE dacă elementul e ascuns. */
  pointAt?(element: Element, message: string): Promise<ToolResult<ToolData["point_at"]>>;
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
      case "audit_ui": {
        if (!deps.audit) return fail("INTERNAL", "Auditul nu e încă pornit în pagină.");
        return deps.audit(args);
      }
      case "say": {
        if (typeof a.message !== "string") return fail("INVALID_ARGS", "say cere message.");
        deps.say?.(a.message);
        return { ok: true, data: { shown: true } };
      }
      case "point_at": {
        if (typeof a.elementId !== "string" || typeof a.message !== "string") {
          return fail("INVALID_ARGS", "point_at cere elementId (din snapshot) și message.");
        }
        const element = deps.registry.elementOf(a.elementId);
        if (!element) {
          return fail("ELEMENT_NOT_FOUND", `Elementul ${a.elementId} nu mai e în pagină. Cere un snapshot nou.`);
        }
        if (!deps.pointAt) return fail("INTERNAL", "Mascota nu e încă pornită în pagină.");
        return await deps.pointAt(element, a.message);
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
