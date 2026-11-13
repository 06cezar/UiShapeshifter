// Definițiile pentru model ale uneltelor de site din etapele 2 și 3. Etapa 1 (`SITE_TOOL_DEFINITIONS`) rămâne în
// tools.ts. Serverul dă modelului doar uneltele etapei la care e extensia: `siteToolDefinitions(stage)`.
// Semantica fiecărei unelte: specs/05-unelte-agent.md.

import { DOM_OP_LIMITS, SETTABLE_ATTRS } from "./dom-ops";
import { SITE_TOOL_DEFINITIONS } from "./tools";

/** Unde se pune ceva față de un element al paginii (`DomPlace`). */
const DOM_PLACE = {
  type: "object",
  properties: {
    selector: { type: "string", description: "Selectorul elementului-reper, din snapshot." },
    position: { type: "string", enum: ["before", "after", "prepend", "append"] },
  },
  required: ["selector", "position"],
} as const;

/**
 * Câmpurile unei operații din `apply_ops` (`DomOp`, dom-ops.ts). Schema e plată, ca să o înțeleagă orice model:
 * fiecare câmp spune la ce operații se folosește, iar descrierea uneltei dă forma exactă a fiecărei operații.
 */
const DOM_OP_ITEM = {
  type: "object",
  properties: {
    op: { type: "string", enum: ["remove", "move", "wrap", "setText", "setAttr", "insertHtml", "bind", "inject"] },
    selector: { type: "string", description: "remove, move, setText, setAttr: selectorul elementului, din snapshot." },
    // Fără `type`: la move e un obiect, la bind un text, iar unii furnizori de modele nu acceptă `anyOf` la unelte.
    to: {
      description:
        "move: unde îl muți, ca obiect { selector, position } (position: before, after, prepend, append). " +
        "bind: text, selectorul elementului real care e apăsat.",
    },
    selectors: { type: "array", items: { type: "string" }, description: "wrap: elementele puse împreună în container." },
    id: {
      type: "string",
      description: `wrap, insertHtml, inject: numele elementului adăugat (litere mici, cifre și „-”, cel mult ${DOM_OP_LIMITS.maxShapeIdChars}).`,
    },
    tag: { type: "string", enum: ["div", "section", "nav", "aside", "header", "ul"], description: "wrap: implicit div." },
    text: { type: "string", description: `setText: textul nou, cel mult ${DOM_OP_LIMITS.maxTextChars} de caractere.` },
    name: { type: "string", enum: SETTABLE_ATTRS, description: "setAttr: atributul schimbat." },
    value: { type: "string", description: "setAttr: valoarea nouă." },
    html: { type: "string", description: "insertHtml: HTML simplu (div, p, a, button, ul…), fără script, style sau on*." },
    at: { ...DOM_PLACE, description: "insertHtml, inject: unde se pune elementul nou." },
    from: { type: "string", description: "bind: `id`-ul elementului adăugat de tine; apăsarea lui apasă elementul `to`." },
    component: {
      type: "object",
      description:
        "inject: componentă din catalog, { id, type, props?, action?, children? }. `action` e { kind: \"click\", selector }, " +
        "{ kind: \"navigate\", path } sau { kind: \"askAgent\", goal }.",
    },
  },
  required: ["op"],
} as const;

/** Etapa 2: structură, mascotă, verificare, control. */
export const SITE_TOOL_DEFINITIONS_STAGE2 = [
  {
    type: "function",
    function: {
      name: "apply_ops",
      description:
        "Schimbă structura paginii: remove, move, wrap, setText, setAttr, insertHtml, bind, inject. Elementele se aleg cu `selector` " +
        "din snapshot. Operațiile care nu s-au putut aplica apar în `skipped`, cu motiv. Ce ai adăugat primește `data-shape=\"<id>\"`, " +
        "ca să-l stilizezi cu apply_css. Fără JavaScript și fără `<script>`, `<iframe>`, `on*`: ce nu e voie se scoate. " +
        "Forma fiecărei operații: { op: \"remove\", selector } · { op: \"move\", selector, to: { selector, position } } · " +
        "{ op: \"wrap\", selectors, id, tag? } · { op: \"setText\", selector, text } · { op: \"setAttr\", selector, name, value } · " +
        "{ op: \"insertHtml\", id, html, at: { selector, position } } · { op: \"bind\", from, to } · " +
        "{ op: \"inject\", id, component, at: { selector, position } }.",
      parameters: {
        type: "object",
        properties: {
          ops: { type: "array", maxItems: DOM_OP_LIMITS.maxOpsPerCall, items: DOM_OP_ITEM },
          reason: { type: "string" },
        },
        required: ["ops", "reason"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "point_at",
      description:
        "Mascota merge la un element al paginii și îl arată, cu un mesaj scurt. `elementId` e id-ul din snapshot. " +
        "Eșuează cu NOT_VISIBLE dacă elementul e ascuns (deschide întâi meniul).",
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
      description: "Așteaptă click-ul omului. Întoarce ce a apăsat de fapt și dacă e elementul așteptat.",
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
      description: "Întreabă omul când cererea e neclară sau o schimbare ar scoate ceva important. Variante scurte când se poate.",
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
      description:
        "Arată schimbările rulării ca previzualizare; omul alege Păstrez sau Anulez. Schimbările sunt deja aplicate: " +
        "nu trimite `ops`. Obligatoriu după schimbări mari (structură nouă, multe elemente scoase).",
      parameters: {
        type: "object",
        properties: {
          title: { type: "string" },
          summary: { type: "string" },
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
      description:
        "Verifică pagina așa cum arată acum: font minim, contrast, mărimea țintelor, text tăiat, elemente în afara ecranului. " +
        "Fiecare problemă poate avea `fixCss`, pe care îl dai lui apply_css. Cheamă-l după orice schimbare vizuală.",
      parameters: { type: "object", properties: { regionId: { type: "string" } } },
    },
  },
] as const;

/** Etapa 3: memoria. */
export const SITE_TOOL_DEFINITIONS_STAGE3 = [
  {
    type: "function",
    function: {
      name: "get_profile",
      description: "Profilul omului: nevoi, preferințe generale (valabile pe orice site), site-uri familiare, fapte învățate.",
      parameters: { type: "object", properties: {} },
    },
  },
  {
    type: "function",
    function: {
      name: "update_profile",
      description:
        "Salvează ce ai învățat despre om, cu dovezi. O cerere care sună general („nu vreau AI în site-uri”) devine o " +
        "preferință generală (`patch` pe /generalPreferences). Nu inventa fapte.",
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
          patch: { type: "array", items: { type: "object" } },
        },
      },
    },
  },
] as const;

export type SiteToolStage = 1 | 2 | 3;

/** Uneltele pe care le primește modelul la o etapă (cumulativ). */
export function siteToolDefinitions(stage: SiteToolStage) {
  return [
    ...SITE_TOOL_DEFINITIONS,
    ...(stage >= 2 ? SITE_TOOL_DEFINITIONS_STAGE2 : []),
    ...(stage >= 3 ? SITE_TOOL_DEFINITIONS_STAGE3 : []),
  ];
}
