// Uneltele web ale lui B (specs/05): get_ui_snapshot, patch_config, apply_template, navigate.
// Argumentele vin de la model, neverificate: fiecare handler le verifică și întoarce INVALID_ARGS dacă nu se potrivesc.
// Schimbările agentului intră în istoricul store-ului cu meta { by: "agent", reason, runId }.

import type { JsonPatchOp, LayoutTemplate, ToolError, ToolResult } from "@uishapeshifter/contracts";
import type { ChangeMeta, ChangeResult } from "../ui/config-store";
import { HOME_ID, visibleModules } from "../ui/layout-model";
import type { ToolContext, ToolHandler } from "./index";

/** Câte încălcări intră în mesajul pentru model; toate sunt în `details`. */
const VIOLATIONS_IN_MESSAGE = 3;
const TEMPLATES: Record<LayoutTemplate, true> = {
  "sidebar-feed": true,
  "bottom-nav-stories": true,
  "simple-tiles": true,
};

export type OwnWebTool = "get_ui_snapshot" | "patch_config" | "apply_template" | "navigate";

export const WEB_TOOLS: { [N in OwnWebTool]: ToolHandler<N> } = {
  get_ui_snapshot(args, ctx) {
    if (!isRecord(args) || (args.moduleId !== undefined && typeof args.moduleId !== "string")) {
      return invalidArgs("get_ui_snapshot primește cel mult { moduleId: text }.");
    }
    return { ok: true, data: ctx.registry.compactSnapshot({ moduleId: args.moduleId }) };
  },

  patch_config(args, ctx) {
    if (!isRecord(args) || !Array.isArray(args.ops) || !isReason(args.reason)) {
      return invalidArgs("patch_config are nevoie de ops (listă JSON Patch) și reason (text).");
    }
    // Forma fiecărei operații o verifică poarta din store (json-patch.ts), cu încălcări pe care modelul le citește.
    const result = ctx.store.getState().applyPatch(args.ops as JsonPatchOp[], agentMeta(args.reason, ctx));
    return result.ok ? { ok: true, data: { revision: result.revision, applied: result.applied } } : refused(result);
  },

  apply_template(args, ctx) {
    if (!isRecord(args) || !isTemplate(args.template) || !isReason(args.reason)) {
      return invalidArgs(`apply_template are nevoie de template (${Object.keys(TEMPLATES).join(", ")}) și reason.`);
    }
    const result = ctx.store.getState().applyTemplate(args.template, agentMeta(args.reason, ctx));
    return result.ok ? { ok: true, data: { revision: result.revision } } : refused(result);
  },

  navigate(args, ctx) {
    if (!isRecord(args) || typeof args.moduleId !== "string") {
      return invalidArgs("navigate are nevoie de moduleId (text).");
    }
    const moduleId = args.moduleId;
    const state = ctx.store.getState();
    if (moduleId !== HOME_ID) {
      const module = state.config.modules.find((m) => m.id === moduleId);
      if (!module) return notFound(`Nu există modulul „${moduleId}”. Vezi modulele în get_ui_snapshot.`);
      if (!visibleModules(state.config).includes(module)) {
        return notFound(
          `Modulul „${module.title}” e ascuns. Fă-l întâi vizibil (patch_config pe /modules/@${moduleId}/visible) ` +
            "sau întreabă omul.",
        );
      }
    }
    state.navigate(moduleId);
    return { ok: true, data: { route: moduleId } };
  },
};

function agentMeta(reason: string, ctx: ToolContext): ChangeMeta {
  return { by: "agent", reason, runId: ctx.runId };
}

/** Refuzul porții: LIMIT_VIOLATION cu toate încălcările în `details` (specs/02, punctul 3). */
function refused(result: Extract<ChangeResult, { ok: false }>): ToolResult<never> {
  const shown = result.violations
    .slice(0, VIOLATIONS_IN_MESSAGE)
    .map((v) => v.message)
    .join(" ");
  const error: ToolError = {
    code: "LIMIT_VIOLATION",
    message: `Schimbarea a fost refuzată: ${shown} Alege alte valori.`,
    details: result.violations,
  };
  return { ok: false, error };
}

function invalidArgs(message: string): ToolResult<never> {
  return { ok: false, error: { code: "INVALID_ARGS", message } };
}

function notFound(message: string): ToolResult<never> {
  return { ok: false, error: { code: "ELEMENT_NOT_FOUND", message } };
}

function isReason(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function isTemplate(value: unknown): value is LayoutTemplate {
  return typeof value === "string" && Object.hasOwn(TEMPLATES, value);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
