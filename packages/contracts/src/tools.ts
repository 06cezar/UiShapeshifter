// Uneltele agentului. Modelul (prin OpenRouter, tool calling compatibil OpenAI) le cheamă după nume;
// serverul fie le execută singur ("server"), fie le trimite frontend-ului prin WebSocket ("web").
// Semantica fiecărei unelte: specs/05-unelte-agent.md.

import type { AuditReport } from "./audit";
import type { ComponentSpec } from "./components";
import type { MascotState } from "./protocol";
import type { ProfileFact, UserProfile } from "./profile";
import type { UISnapshot } from "./snapshot";
import type { JsonPatchOp, LayoutTemplate } from "./ui-config";

export type ToolName =
  | "get_ui_snapshot"
  | "patch_config"
  | "apply_template"
  | "generate_component"
  | "remove_component"
  | "navigate"
  | "point_at"
  | "wait_for_user_click"
  | "ask_user"
  | "propose_changes"
  | "audit_ui"
  | "say"
  | "get_profile"
  | "update_profile"
  | "finish";

export const TOOL_RUNS_ON: Record<ToolName, "web" | "server"> = {
  get_ui_snapshot: "web",
  patch_config: "web",
  apply_template: "web",
  generate_component: "web",
  remove_component: "web",
  navigate: "web",
  point_at: "web",
  wait_for_user_click: "web",
  ask_user: "web",
  propose_changes: "web",
  audit_ui: "web",
  say: "web",
  get_profile: "server",
  update_profile: "server",
  finish: "server",
};

// ---------- argumente ----------

export interface ToolArgs {
  get_ui_snapshot: { moduleId?: string };
  patch_config: { ops: JsonPatchOp[]; reason: string };
  apply_template: { template: LayoutTemplate; reason: string };
  generate_component: {
    component: ComponentSpec;
    placement: { moduleId: string; position: "top" | "bottom" } | { newModule: { title: string } };
    reason: string;
  };
  remove_component: { componentId: string; reason: string };
  navigate: { moduleId: string };
  point_at: { elementId: string; message: string };
  wait_for_user_click: { elementId: string; timeoutMs?: number };
  ask_user: { question: string; options?: string[] };
  propose_changes: {
    title: string;           // ex. „Butoane mai mari”
    summary: string;         // ce se schimbă și de ce, pe înțeles
    ops?: JsonPatchOp[];
    component?: ToolArgs["generate_component"];
    risk: "low" | "high";
  };
  audit_ui: { moduleId?: string };
  say: { message: string; mascot?: MascotState };
  get_profile: Record<string, never>;
  update_profile: { facts?: Omit<ProfileFact, "id" | "createdAt">[]; patch?: JsonPatchOp[] };
  finish: { summary: string; success: boolean };
}

// ---------- rezultate ----------

export type ToolErrorCode =
  | "ELEMENT_NOT_FOUND"   // id-ul nu e în registru
  | "NOT_VISIBLE"         // e în registru, dar ascuns (meniu închis, alt modul)
  | "LIMIT_VIOLATION"     // patch-ul încalcă HARD_LIMITS sau pragurile din profil
  | "INVALID_ARGS"        // nu respectă schema (ex. componentă peste COMPONENT_LIMITS)
  | "TIMEOUT"
  | "USER_CANCELLED"
  | "INTERNAL";

export interface ToolError {
  code: ToolErrorCode;
  message: string;        // pentru model: ce s-a întâmplat și ce poate încerca
  details?: unknown;      // ex. lista încălcărilor la LIMIT_VIOLATION
}

export type ToolResult<T = unknown> = { ok: true; data: T } | { ok: false; error: ToolError };

export interface ToolData {
  get_ui_snapshot: UISnapshot;
  patch_config: { revision: number; applied: number };
  apply_template: { revision: number };
  generate_component: { revision: number; elementIds: string[] };
  remove_component: { revision: number };
  navigate: { route: string };
  point_at: { scrolledIntoView: boolean; rect: { x: number; y: number; width: number; height: number } };
  wait_for_user_click: { clickedElementId: string | null; correct: boolean; timedOut: boolean };
  ask_user: { answer: string };
  propose_changes: { proposalId: string; decision: "keep" | "undo"; revision: number };
  audit_ui: AuditReport;
  say: { shown: true };
  get_profile: UserProfile;
  update_profile: { updatedAt: string };
  finish: { runId: string };
}

// ---------- definițiile pentru model (format OpenAI / OpenRouter) ----------

const JSON_PATCH_OPS = {
  type: "array",
  items: {
    type: "object",
    properties: {
      op: { type: "string", enum: ["replace", "add", "remove"] },
      path: { type: "string", description: "JSON Pointer în UIConfig, ex. /theme/baseFontPx" },
      value: {},
    },
    required: ["op", "path"],
  },
} as const;

const COMPONENT_SPEC = {
  type: "object",
  description: "Arbore de componente din catalog (specs/03-componente-generate.md). Fără HTML.",
  properties: {
    id: { type: "string" },
    type: {
      type: "string",
      enum: ["stack", "row", "grid", "card", "heading", "text", "button", "image", "contactTile", "shortcut", "list", "badge", "divider"],
    },
    props: { type: "object" },
    action: { type: "object" },
    children: { type: "array", items: { type: "object" } },
  },
  required: ["id", "type"],
} as const;

export const TOOL_DEFINITIONS = [
  {
    type: "function",
    function: {
      name: "get_ui_snapshot",
      description: "Ce e acum pe ecran: elementele cu id, rol, text, poziție, mărime, font, contrast, vizibilitate.",
      parameters: { type: "object", properties: { moduleId: { type: "string" } } },
    },
  },
  {
    type: "function",
    function: {
      name: "patch_config",
      description: "Schimbă configurația interfeței (JSON Patch). Refuzat cu LIMIT_VIOLATION dacă încalcă limitele de accesibilitate.",
      parameters: {
        type: "object",
        properties: { ops: JSON_PATCH_OPS, reason: { type: "string" } },
        required: ["ops", "reason"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "apply_template",
      description: "Schimbă structura (nu culorile): sidebar-feed, bottom-nav-stories sau simple-tiles.",
      parameters: {
        type: "object",
        properties: {
          template: { type: "string", enum: ["sidebar-feed", "bottom-nav-stories", "simple-tiles"] },
          reason: { type: "string" },
        },
        required: ["template", "reason"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "generate_component",
      description: "Creează un element nou în interfață (placă, scurtătură, listă) din catalogul de componente.",
      parameters: {
        type: "object",
        properties: {
          component: COMPONENT_SPEC,
          placement: {
            type: "object",
            description: "{ moduleId, position: top|bottom } sau { newModule: { title } }",
          },
          reason: { type: "string" },
        },
        required: ["component", "placement", "reason"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "remove_component",
      description: "Șterge un element generat anterior.",
      parameters: {
        type: "object",
        properties: { componentId: { type: "string" }, reason: { type: "string" } },
        required: ["componentId", "reason"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "navigate",
      description: "Deschide un modul (ecran) al aplicației.",
      parameters: { type: "object", properties: { moduleId: { type: "string" } }, required: ["moduleId"] },
    },
  },
  {
    type: "function",
    function: {
      name: "point_at",
      description: "Mascota arată cu lăbuța spre un element și spune un mesaj scurt. Eșuează cu NOT_VISIBLE dacă elementul e ascuns.",
      parameters: {
        type: "object",
        properties: { elementId: { type: "string" }, message: { type: "string" } },
        required: ["elementId", "message"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "wait_for_user_click",
      description: "Așteaptă click-ul utilizatorului. Întoarce ce a apăsat de fapt și dacă e elementul așteptat.",
      parameters: {
        type: "object",
        properties: { elementId: { type: "string" }, timeoutMs: { type: "number" } },
        required: ["elementId"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "ask_user",
      description: "Întreabă utilizatorul când lipsește o informație. Folosește variante scurte când se poate.",
      parameters: {
        type: "object",
        properties: { question: { type: "string" }, options: { type: "array", items: { type: "string" } } },
        required: ["question"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "propose_changes",
      description: "Arată o schimbare ca previzualizare; utilizatorul alege Păstrez sau Anulez. Obligatoriu pentru schimbări mari.",
      parameters: {
        type: "object",
        properties: {
          title: { type: "string" },
          summary: { type: "string" },
          ops: JSON_PATCH_OPS,
          component: { type: "object" },
          risk: { type: "string", enum: ["low", "high"] },
        },
        required: ["title", "summary", "risk"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "audit_ui",
      description: "Verifică accesibilitatea interfeței randate: font minim, contrast, mărimea țintelor, suprapuneri, text tăiat.",
      parameters: { type: "object", properties: { moduleId: { type: "string" } } },
    },
  },
  {
    type: "function",
    function: {
      name: "say",
      description: "Mascota spune ceva utilizatorului (fără să aștepte răspuns).",
      parameters: {
        type: "object",
        properties: {
          message: { type: "string" },
          mascot: { type: "string", enum: ["idle", "listening", "thinking", "speaking", "pointing", "happy", "confused"] },
        },
        required: ["message"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_profile",
      description: "Profilul utilizatorului: nevoi (font minim, contrast, ținte), preferințe, persona, fapte învățate.",
      parameters: { type: "object", properties: {} },
    },
  },
  {
    type: "function",
    function: {
      name: "update_profile",
      description: "Salvează ce ai învățat despre utilizator, cu dovezi. Nu inventa fapte.",
      parameters: {
        type: "object",
        properties: {
          facts: {
            type: "array",
            items: {
              type: "object",
              properties: {
                statement: { type: "string" },
                evidence: { type: "array", items: { type: "string" } },
                confidence: { type: "number" },
                source: { type: "string", enum: ["onboarding", "usage", "conversation"] },
              },
              required: ["statement", "evidence", "confidence", "source"],
            },
          },
          patch: JSON_PATCH_OPS,
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "finish",
      description: "Încheie rularea cu un rezumat pentru utilizator.",
      parameters: {
        type: "object",
        properties: { summary: { type: "string" }, success: { type: "boolean" } },
        required: ["summary", "success"],
      },
    },
  },
] as const;
