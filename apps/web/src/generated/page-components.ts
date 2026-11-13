// Componentele din catalog puse de agent în pagina unui site (`inject`, B3, specs/03): scurtături, plăci, carduri.
// Agentul nu scrie HTML aici: compune un arbore din catalog, iar noi îl verificăm și îl randăm cu tema noastră.
// Comportamentul vine doar din acțiunile catalogului (`PageAction`), niciodată din cod scris de model.

import { COMPONENT_LIMITS, DEFAULT_CONFIG, DOM_OP_LIMITS } from "@uishapeshifter/contracts";
import type { IconName, PageAction, PageComponentSpec, PageComponentType } from "@uishapeshifter/contracts";
import { OUR_INTERFACE_MARKERS } from "../validation";
import { themeToCssVars } from "../ui/theme-css";

/** Atributul rădăcinii unei componente: conține „uishapeshifter”, deci CSS-ul agentului nu ne poate strica stilul. */
export const GEN_ROOT_ATTR = "data-uishapeshifter-gen";
export const GEN_STYLE_ID = "uishapeshifter-gen-style";

const PAGE_TYPES: ReadonlySet<PageComponentType> = new Set([
  "stack", "row", "grid", "card", "heading", "text", "button", "shortcut", "badge", "divider",
]); // prettier-ignore
const CONTAINERS: ReadonlySet<PageComponentType> = new Set(["stack", "row", "grid", "card"]);
const PRESSABLE: ReadonlySet<PageComponentType> = new Set(["button", "shortcut"]);
const ALLOWED_PROPS = new Set(["text", "label", "icon", "tone", "size", "columns"]);
const TONES = new Set(["primary", "neutral", "danger"]);
const SIZES = new Set(["m", "l", "xl"]);
const MAX_GRID_COLUMNS = 4;
const COMPONENT_ID = /^[a-z0-9-]+$/;

/** Iconițele catalogului, ca simboluri de text: fără imagini, deci nimic încărcat din afară. */
const ICONS: Record<IconName, string> = {
  message: "✉", photo: "🖼", phone: "☎", video: "🎥", contacts: "👥", settings: "⚙", home: "🏠",
  heart: "♥", star: "★", camera: "📷", send: "➤", help: "?", back: "←", plus: "+",
}; // prettier-ignore

/** Treptele de font din temă pentru mărimile butoanelor. */
const SIZE_FONT_STEP: Record<"m" | "l" | "xl", number> = { m: 0, l: 1, xl: 2 };
/** Cât de înalt e un buton față de ținta minimă, pe mărimi. */
const SIZE_TARGET_SCALE: Record<"m" | "l" | "xl", number> = { m: 1, l: 1.25, xl: 1.5 };

/** Stilul componentelor: doar variabile din temă; `all: revert-layer` le izolează de CSS-ul site-ului. */
const GEN_CSS = `
[${GEN_ROOT_ATTR}], [${GEN_ROOT_ATTR}] * { all: revert-layer; box-sizing: border-box; }
[${GEN_ROOT_ATTR}] { display: block; font-family: var(--font-family); font-size: var(--font-base);
  line-height: var(--line-height); color: var(--color-text); margin: var(--spacing) 0; }
[${GEN_ROOT_ATTR}] .gen-stack { display: flex; flex-direction: column; gap: var(--spacing); }
[${GEN_ROOT_ATTR}] .gen-row { display: flex; flex-wrap: wrap; align-items: center; gap: var(--spacing); }
[${GEN_ROOT_ATTR}] .gen-grid { display: grid; gap: var(--spacing);
  grid-template-columns: repeat(var(--gen-columns), minmax(0, 1fr)); }
[${GEN_ROOT_ATTR}] .gen-card { display: flex; flex-direction: column; gap: var(--spacing);
  padding: calc(var(--spacing) * 2); border-radius: var(--radius); background: var(--color-surface); }
[${GEN_ROOT_ATTR}] .gen-heading { display: block; margin: 0; font-size: var(--font-step-2); font-weight: 700; }
[${GEN_ROOT_ATTR}] .gen-text { display: block; margin: 0; }
[${GEN_ROOT_ATTR}] .gen-button { display: inline-flex; align-items: center; justify-content: center;
  gap: var(--spacing); min-width: var(--min-target); min-height: var(--gen-target, var(--min-target));
  padding: 0 calc(var(--spacing) * 2); border: 0; border-radius: var(--radius); cursor: pointer;
  font: inherit; font-size: var(--gen-font, var(--font-base)); font-weight: 700;
  background: var(--color-surface); color: var(--color-text); }
[${GEN_ROOT_ATTR}] .gen-button[data-tone="primary"] { background: var(--color-primary); color: var(--color-on-primary); }
[${GEN_ROOT_ATTR}] .gen-button[data-tone="danger"] { background: var(--color-danger); color: var(--color-on-primary); }
[${GEN_ROOT_ATTR}] .gen-button:focus-visible { outline: calc(var(--spacing) / 2) solid var(--color-focus);
  outline-offset: calc(var(--spacing) / 4); }
[${GEN_ROOT_ATTR}] .gen-badge { display: inline-block; padding: 0 var(--spacing); border-radius: var(--radius);
  background: var(--color-primary); color: var(--color-on-primary); }
[${GEN_ROOT_ATTR}] .gen-divider { display: block; margin: var(--spacing) 0; border: 0;
  border-top: calc(var(--spacing) / 8) solid var(--color-text-muted); }
`;

/** Ce fac acțiunile, în pagină: apasă un element real, deschide o cale a site-ului sau pornește agentul. */
export interface ComponentActions {
  click(selector: string): void;
  navigate(path: string): void;
  askAgent(goal: string): void;
}

/** Problema din arbore, pe înțeles pentru model, sau `null` dacă e bun. */
export function pageComponentProblem(spec: unknown, doc: Document): string | null {
  let nodes = 0;
  function check(node: unknown, depth: number): string | null {
    nodes += 1;
    if (nodes > COMPONENT_LIMITS.maxNodes) return `Componenta are peste ${COMPONENT_LIMITS.maxNodes} de noduri.`;
    if (depth > COMPONENT_LIMITS.maxDepth) return `Componenta e mai adâncă de ${COMPONENT_LIMITS.maxDepth} niveluri.`;
    if (!isRecord(node)) return "Fiecare componentă e un obiect { id, type, props?, action?, children? }.";
    if (typeof node.id !== "string" || !COMPONENT_ID.test(node.id) || node.id.length > DOM_OP_LIMITS.maxShapeIdChars) {
      return `id-ul componentei are doar litere mici, cifre și „-”, cel mult ${DOM_OP_LIMITS.maxShapeIdChars}.`;
    }
    const type = node.type as PageComponentType;
    if (typeof node.type !== "string" || !PAGE_TYPES.has(type)) {
      return `type e unul din: ${[...PAGE_TYPES].join(", ")}.`;
    }
    const propsProblem = checkProps(node.props, type);
    if (propsProblem) return propsProblem;
    if (node.action !== undefined) {
      if (!PRESSABLE.has(type)) return `Doar button și shortcut au action (nu ${type}).`;
      const actionProblem = checkAction(node.action, doc);
      if (actionProblem) return actionProblem;
    }
    if (node.children !== undefined) {
      if (!CONTAINERS.has(type)) return `Doar stack, row, grid și card au children (nu ${type}).`;
      if (!Array.isArray(node.children)) return "children e o listă de componente.";
      for (const child of node.children) {
        const problem = check(child, depth + 1);
        if (problem) return problem;
      }
    }
    return null;
  }
  return check(spec, 1);
}

function checkProps(props: unknown, type: PageComponentType): string | null {
  if (props === undefined) return PRESSABLE.has(type) ? `${type} cere props.label (textul butonului).` : null;
  if (!isRecord(props)) return "props e un obiect.";
  for (const [name, value] of Object.entries(props)) {
    if (!ALLOWED_PROPS.has(name)) return `props.${name} nu e permis; doar ${[...ALLOWED_PROPS].join(", ")}.`;
    if ((name === "text" || name === "label") && !isShortText(value)) {
      return `props.${name} e text de cel mult ${COMPONENT_LIMITS.maxTextChars} de caractere.`;
    }
    if (name === "icon" && !(typeof value === "string" && Object.hasOwn(ICONS, value))) {
      return `props.icon e unul din: ${Object.keys(ICONS).join(", ")}.`;
    }
    if (name === "tone" && !TONES.has(value as string)) return "props.tone e primary, neutral sau danger.";
    if (name === "size" && !SIZES.has(value as string)) return "props.size e m, l sau xl.";
    if (
      name === "columns" &&
      !(Number.isInteger(value) && (value as number) >= 1 && (value as number) <= MAX_GRID_COLUMNS)
    ) {
      return `props.columns e un număr între 1 și ${MAX_GRID_COLUMNS}.`;
    }
  }
  if (PRESSABLE.has(type) && !isShortText(props.label)) return `${type} cere props.label (textul butonului).`;
  return null;
}

function checkAction(action: unknown, doc: Document): string | null {
  if (!isRecord(action)) return "action e { kind: click | navigate | askAgent, … }.";
  switch (action.kind) {
    case "click":
      return selectorProblem(action.selector, doc);
    case "navigate":
      return isSitePath(action.path) ? null : "navigate cere path, o cale a site-ului care începe cu „/” (nu „//”).";
    case "askAgent":
      return isShortText(action.goal)
        ? null
        : `askAgent cere goal, de cel mult ${COMPONENT_LIMITS.maxTextChars} de caractere.`;
    default:
      return "action.kind e click, navigate sau askAgent.";
  }
}

function selectorProblem(selector: unknown, doc: Document): string | null {
  if (typeof selector !== "string" || !selector.trim()) return "click cere selector, un selector din snapshot.";
  if (OUR_INTERFACE_MARKERS.some((marker) => selector.toLowerCase().includes(marker))) {
    return `Selectorul „${selector}” țintește interfața extensiei.`;
  }
  try {
    doc.querySelector(selector);
    return null;
  } catch {
    return `Selectorul „${selector}” nu e valid. Folosește un selector din snapshot.`;
  }
}

/** Randarea unui arbore deja verificat cu `pageComponentProblem`. Rădăcina are tema noastră și `GEN_ROOT_ATTR`. */
export function renderPageComponent(
  spec: PageComponentSpec,
  actions: ComponentActions,
  doc: Document = document,
): HTMLElement {
  ensureGenStyle(doc);
  const root = doc.createElement("div");
  root.setAttribute(GEN_ROOT_ATTR, "");
  for (const [name, value] of Object.entries(themeToCssVars(DEFAULT_CONFIG.theme, DEFAULT_CONFIG.minTargetPx))) {
    root.style.setProperty(name, value);
  }
  root.append(renderNode(spec, actions, doc));
  return root;
}

function renderNode(spec: PageComponentSpec, actions: ComponentActions, doc: Document): HTMLElement {
  const props = spec.props ?? {};
  let el: HTMLElement;
  switch (spec.type) {
    case "stack":
    case "row":
    case "grid":
      el = doc.createElement("div");
      el.className = `gen-${spec.type}`;
      if (spec.type === "grid") el.style.setProperty("--gen-columns", String(props.columns ?? 2));
      break;
    case "card":
      el = doc.createElement("section");
      el.className = "gen-card";
      if (props.label) el.append(textElement(doc, "h3", "gen-heading", props.label));
      if (props.text) el.append(textElement(doc, "p", "gen-text", props.text));
      break;
    case "heading":
      el = textElement(doc, "h3", "gen-heading", props.text ?? props.label ?? "");
      break;
    case "text":
      el = textElement(doc, "p", "gen-text", props.text ?? props.label ?? "");
      break;
    case "badge":
      el = textElement(doc, "span", "gen-badge", props.text ?? props.label ?? "");
      break;
    case "divider":
      el = doc.createElement("hr");
      el.className = "gen-divider";
      break;
    case "button":
    case "shortcut": {
      const button = doc.createElement("button");
      button.type = "button";
      button.className = `gen-button gen-${spec.type}`;
      button.dataset.tone = props.tone ?? (spec.type === "shortcut" ? "primary" : "neutral");
      const size = props.size ?? (spec.type === "shortcut" ? "l" : "m");
      button.style.setProperty("--gen-font", `var(--font-step-${SIZE_FONT_STEP[size]})`);
      button.style.setProperty("--gen-target", `calc(var(--min-target) * ${SIZE_TARGET_SCALE[size]})`);
      button.setAttribute("aria-label", props.label ?? "");
      if (props.icon) button.append(textElement(doc, "span", "gen-icon", ICONS[props.icon], true));
      button.append(doc.createTextNode(props.label ?? ""));
      const action = spec.action;
      if (action) button.addEventListener("click", () => runAction(action, actions));
      el = button;
      break;
    }
  }
  el.setAttribute("data-agent-id", `gen.${spec.id}`);
  for (const child of spec.children ?? []) el.append(renderNode(child, actions, doc));
  return el;
}

function runAction(action: PageAction, actions: ComponentActions): void {
  if (action.kind === "click") actions.click(action.selector);
  else if (action.kind === "navigate") actions.navigate(action.path);
  else actions.askAgent(action.goal);
}

function textElement(doc: Document, tag: string, className: string, text: string, decorative = false): HTMLElement {
  const el = doc.createElement(tag);
  el.className = className;
  el.textContent = text;
  if (decorative) el.setAttribute("aria-hidden", "true");
  return el;
}

function ensureGenStyle(doc: Document): void {
  if (doc.getElementById(GEN_STYLE_ID)) return;
  const style = doc.createElement("style");
  style.id = GEN_STYLE_ID;
  style.textContent = GEN_CSS;
  (doc.head ?? doc.documentElement).appendChild(style);
}

/** O cale a aceluiași site: începe cu „/”, dar nu cu „//” (acolo ar fi alt site). */
export function isSitePath(path: unknown): path is string {
  return typeof path === "string" && path.startsWith("/") && !path.startsWith("//") && !/[\u0000- ]/.test(path);
}

function isShortText(value: unknown): value is string {
  return typeof value === "string" && value.trim() !== "" && value.length <= COMPONENT_LIMITS.maxTextChars;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
