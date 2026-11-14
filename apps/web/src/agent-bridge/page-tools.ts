// Executorul uneltelor „web” în pagina unui site (etapa 1, specs/05 și 06): primește tool_call de la server, întoarce
// tool_result. get_page_snapshot îl face registrul (B2), apply_css și apply_ops motorul de rețete (B5, B6),
// say bula mascotei (D), point_at mascota (D2), care merge la elementul găsit în registru, wait_for_user_click
// ascultă click-ul omului (ghidajul „arată-mi cum…”), ask_user întrebarea în chat (D), undo_request scoate o cerere
// de mai demult din rețetă (motorul, #82), propose_changes panoul (D9, Păstrez / Anulez).

import type {
  ApplyCssData,
  ApplyOpsData,
  PageSnapshot,
  ToolData,
  ToolName,
  ToolResult,
} from "@uishapeshifter/contracts";
import type { PageRegistry } from "../ui/page-registry/registry";

/** Cât așteptăm click-ul omului când modelul nu spune (ghidajul „arată-mi cum…”, specs/05). */
export const DEFAULT_CLICK_TIMEOUT_MS = 60_000;
/** Cel puțin atât: omul are nevoie de o clipă să citească bula și să găsească elementul. */
const MIN_CLICK_TIMEOUT_MS = 3_000;
/** Cel mult atât ținem rularea pe loc; după, modelul întreabă dacă omul are nevoie de ajutor. */
const MAX_CLICK_TIMEOUT_MS = 120_000;

/** Motorul de rețete, așa cum îl vede executorul (recipe-engine.ts, B5 și B6). */
export interface RecipeApplier {
  applyCss(args: {
    css: string;
    mode?: "append" | "replace";
    reason: string;
    runId?: string;
  }): Promise<ToolResult<ApplyCssData>>;
  applyOps(args: { ops: unknown[]; reason: string; runId?: string }): Promise<ToolResult<ApplyOpsData>>;
}

export interface PageToolDeps {
  registry: PageRegistry;
  recipes?: RecipeApplier;
  /** Auditul de accesibilitate al paginii (C2, runAuditUi), legat în content script cu registrul și rețeta. */
  audit?(args: unknown): ToolResult;
  /** Arată mesajul agentului (bula mascotei, D3); fără ea, îl ignorăm, dar răspundem „shown”. */
  say?(message: string): void;
  /** Mascota merge la element și îl arată (D2); întoarce NOT_VISIBLE dacă elementul e ascuns. */
  pointAt?(element: Element, message: string): Promise<ToolResult<ToolData["point_at"]>>;
  /**
   * Întrebarea agentului în chat, cu variante ca butoane (D, chat.ask). `null` = omul n-a răspuns (2 min, rularea s-a
   * terminat sau a venit altă întrebare).
   */
  askUser?(question: string, options?: string[]): Promise<string | null>;
  /**
   * Scoate o singură cerere din rețeta site-ului (motorul de rețete, `undoRequest`, #82); cele de dinainte și de după
   * rămân. Aceeași funcție ca „Anulez” din lista „Ce ai cerut aici” a panoului.
   */
  undoRequest?(
    requestId: string,
  ): Promise<{ ok: true; revision: number; droppedOps: number } | { ok: false; message: string }>;
  /** Gazda interfeței noastre: un click în panou sau pe mascotă nu e răspunsul omului la ghidaj. */
  ourHostId?: string;
  doc?: Document;
  /** Panoul arată „Păstrez / Anulez” (D9); argumentele le verifică el. */
  proposeChanges?(args: unknown, runId?: string): Promise<ToolResult<ToolData["propose_changes"]>>;
}

function fail(code: "INVALID_ARGS" | "INTERNAL" | "ELEMENT_NOT_FOUND" | "TIMEOUT", message: string): ToolResult<never> {
  return { ok: false, error: { code, message } };
}

/**
 * Primul click al omului pe pagina site-ului (nu în interfața noastră): ce a apăsat și dacă e elementul așteptat
 * (sau ceva din el). Click-ul își face treaba mai departe; doar ne uităm la el.
 */
function waitForClick(
  expected: Element,
  timeoutMs: number,
  deps: PageToolDeps,
): Promise<ToolResult<ToolData["wait_for_user_click"]>> {
  const doc = deps.doc ?? expected.ownerDocument;
  return new Promise((resolve) => {
    const finish = (data: ToolData["wait_for_user_click"]) => {
      doc.removeEventListener("click", onClick, true);
      clearTimeout(timer);
      resolve({ ok: true, data });
    };
    const onClick = (event: Event) => {
      const target = event.target instanceof Element ? event.target : null;
      if (!target) return;
      if (deps.ourHostId && target.closest(`#${CSS.escape(deps.ourHostId)}`)) return;
      finish({ clickedElementId: deps.registry.idOf(target), correct: expected.contains(target), timedOut: false });
    };
    const timer = setTimeout(() => finish({ clickedElementId: null, correct: false, timedOut: true }), timeoutMs);
    doc.addEventListener("click", onClick, true);
  });
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
      case "apply_ops": {
        // Forma fiecărei operații o verifică motorul (dom-ops.ts), cu motive în `skipped` pe care modelul le citește.
        if (!Array.isArray(a.ops) || typeof a.reason !== "string" || !a.reason.trim()) {
          return fail("INVALID_ARGS", "apply_ops cere ops (listă de operații) și reason (o propoziție).");
        }
        if (!deps.recipes) return fail("INTERNAL", "Motorul de rețete nu e încă pornit în pagină.");
        return await deps.recipes.applyOps({ ops: a.ops, reason: a.reason, runId });
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
      case "wait_for_user_click": {
        if (typeof a.elementId !== "string") {
          return fail("INVALID_ARGS", "wait_for_user_click cere elementId (din snapshot).");
        }
        const element = deps.registry.elementOf(a.elementId);
        if (!element) {
          return fail("ELEMENT_NOT_FOUND", `Elementul ${a.elementId} nu mai e în pagină. Cere un snapshot nou.`);
        }
        const requested = typeof a.timeoutMs === "number" ? a.timeoutMs : DEFAULT_CLICK_TIMEOUT_MS;
        const timeoutMs = Math.min(MAX_CLICK_TIMEOUT_MS, Math.max(MIN_CLICK_TIMEOUT_MS, requested));
        return await waitForClick(element, timeoutMs, deps);
      }
      case "ask_user": {
        if (typeof a.question !== "string" || !a.question.trim()) {
          return fail("INVALID_ARGS", "ask_user cere question (o întrebare scurtă).");
        }
        if (a.options !== undefined && !(Array.isArray(a.options) && a.options.every((o) => typeof o === "string"))) {
          return fail("INVALID_ARGS", "options e o listă de variante scurte (texte).");
        }
        if (!deps.askUser) return fail("INTERNAL", "Chatul nu e încă pornit în pagină.");
        const answer = await deps.askUser(a.question, a.options as string[] | undefined);
        if (answer === null) {
          return fail("TIMEOUT", "Omul n-a răspuns. Continuă cu ce știi sau întreabă mai simplu.");
        }
        return { ok: true, data: { answer } };
      }
      case "undo_request": {
        if (typeof a.requestId !== "string" || !a.requestId.trim()) {
          return fail("INVALID_ARGS", "undo_request cere requestId, din recipe.requests din snapshot.");
        }
        if (!deps.undoRequest) return fail("INTERNAL", "Motorul de rețete nu e încă pornit în pagină.");
        const result = await deps.undoRequest(a.requestId);
        if (!result.ok) {
          return fail(
            "INVALID_ARGS",
            `${result.message} Cererile care pot fi scoase sunt în recipe.requests din snapshot; altfel propune „Revino la original”.`,
          );
        }
        return { ok: true, data: { revision: result.revision, droppedOps: result.droppedOps } };
      }
      case "propose_changes": {
        if (!deps.proposeChanges) return fail("INTERNAL", "Panoul de control nu e încă pornit în pagină.");
        return await deps.proposeChanges(args, runId);
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
