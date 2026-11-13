// Motorul de audit (specs/07): reguli pure pe UISnapshot, plus faptele care se văd doar din DOM
// (înălțimea rândului, text-overflow intenționat, text decorativ, marginile elementelor).
// Faptele din DOM le adună `collectDomFacts` (dom.ts); aici nu se atinge DOM-ul.
// Reparațiile (`fix`) le adaugă C2.

import { HARD_LIMITS } from "@uishapeshifter/contracts";
import type {
  AuditIssue,
  AuditReport,
  AuditThresholds,
  ElementInfo,
  Rect,
  UISnapshot,
} from "@uishapeshifter/contracts";
import { contrastRatio, formatRatio, parseColor, requiredTextContrast } from "./contrast";

/** Ce se măsoară din DOM și nu e în snapshot. Toate câmpurile sunt opționale: lipsa lor sare regula. */
export interface DomFacts {
  /** line-height / font-size, ex. 1.5. Doar pentru elementele cu text propriu. */
  lineHeight?: number;
  /** `text-overflow: ellipsis`: tăierea e voită, nu e eroare. */
  intentionalOverflow?: boolean;
  /** `aria-hidden="true"` sau rol `presentation`: contrastul slab e doar avertisment. */
  decorative?: boolean;
  /** Marginea vizibilă a unui element interactiv și fundalul din jurul lui (WCAG 1.4.11). */
  nonText?: { color: string; background: string };
}
export type DomFactsMap = Record<string, DomFacts>;

export interface AuditOptions {
  /** Faptele din DOM, după id. */
  facts?: DomFactsMap;
  /** Doar elementele modulului (plus navigația, care e mereu pe ecran). */
  moduleId?: string;
  /** `app` (implicit) = aplicația, fără interfața agentului; `agent` = doar mascota, chatul și jurnalul. */
  scope?: "app" | "agent";
  /** Ora raportului, ca testele să fie deterministe. */
  now?: () => Date;
}

/** Interfața agentului se verifică separat și nu blochează (specs/04, specs/07). */
export const AGENT_UI_IDS = ["mascot", "chat-panel", "journal-panel"] as const;

export const SCORE_ERROR_PENALTY = 8;
export const SCORE_WARNING_PENALTY = 2;

/** Toleranțe pentru rotunjirile din browser (subpixeli, zoom). */
const FONT_EPS = 0.05;
const RECT_EPS = 0.5;
const LINE_HEIGHT_EPS = 0.01;
const OFFSCREEN_EPS = 1;
const OVERLAP_MAX_AREA = 4;

export function isAgentUi(id: string): boolean {
  return AGENT_UI_IDS.some((a) => id === a || id.startsWith(a + "."));
}

/** Auditul complet: filtrează elementele, aplică regulile, calculează scorul. */
export function auditSnapshot(snapshot: UISnapshot, thresholds: AuditThresholds, opts: AuditOptions = {}): AuditReport {
  const elements = selectElements(snapshot, opts);
  const issues = runRules(elements, snapshot.viewport, thresholds, opts.facts ?? {});
  return {
    ok: !issues.some((i) => i.severity === "error"),
    score: computeScore(issues),
    issues,
    thresholds,
    checkedElements: elements.length,
    configRevision: snapshot.configRevision,
    checkedAt: (opts.now ?? (() => new Date()))().toISOString(),
  };
}

/** `max(0, 100 − 8 × erori − 2 × avertismente)` */
export function computeScore(issues: Pick<AuditIssue, "severity">[]): number {
  let errors = 0;
  let warnings = 0;
  for (const i of issues) {
    if (i.severity === "error") errors++;
    else warnings++;
  }
  return Math.max(0, 100 - SCORE_ERROR_PENALTY * errors - SCORE_WARNING_PENALTY * warnings);
}

export function selectElements(
  snapshot: UISnapshot,
  opts: Pick<AuditOptions, "moduleId" | "scope"> = {},
): ElementInfo[] {
  const agent = opts.scope === "agent";
  return snapshot.elements.filter((el) => {
    if (!el.visible) return false;
    if (isAgentUi(el.id) !== agent) return false;
    if (opts.moduleId && !agent) return el.moduleId === opts.moduleId || isNavigation(el.id);
    return true;
  });
}

export function runRules(
  elements: ElementInfo[],
  viewport: UISnapshot["viewport"],
  t: AuditThresholds,
  facts: DomFactsMap = {},
): AuditIssue[] {
  const issues: AuditIssue[] = [];
  for (const el of elements) {
    const f = facts[el.id] ?? {};
    issues.push(
      ...checkMinFont(el, t),
      ...checkTextContrast(el, t, f),
      ...checkNonTextContrast(el, f),
      ...checkTargetSize(el, t),
      ...checkClipped(el, f),
      ...checkOffscreen(el, viewport),
      ...checkLineHeight(el, t, f),
    );
  }
  issues.push(...checkOverlap(elements));
  return issues;
}

// ---------- regulile, câte una ----------

export function checkMinFont(el: ElementInfo, t: AuditThresholds): AuditIssue[] {
  if (!hasText(el) || el.fontPx! >= t.minFontPx - FONT_EPS) return [];
  return [
    {
      rule: "min-font",
      severity: "error",
      elementId: el.id,
      measured: round(el.fontPx!),
      expected: t.minFontPx,
      message: `${name(el)} are textul de ${round(el.fontPx!)}px; minimul tău e ${t.minFontPx}px.`,
    },
  ];
}

export function checkTextContrast(el: ElementInfo, t: AuditThresholds, f: DomFacts = {}): AuditIssue[] {
  if (!hasText(el)) return [];
  const ratio = textContrastOf(el);
  if (ratio === undefined) return [];
  const required = requiredTextContrast(el.fontPx, el.fontWeight, t);
  if (ratio >= required) return [];
  const shown = formatRatio(ratio);
  return [
    {
      rule: "contrast",
      severity: f.decorative ? "warning" : "error",
      elementId: el.id,
      measured: shown,
      expected: required,
      message: `${name(el)} se citește greu: contrastul e ${shown}:1, trebuie cel puțin ${required}:1.`,
    },
  ];
}

export function checkNonTextContrast(el: ElementInfo, f: DomFacts = {}): AuditIssue[] {
  if (!el.interactive || !f.nonText) return [];
  if (!parseColor(f.nonText.color) || !parseColor(f.nonText.background)) return [];
  const ratio = contrastRatio(f.nonText.color, f.nonText.background);
  if (ratio >= HARD_LIMITS.minContrastUi) return [];
  const shown = formatRatio(ratio);
  return [
    {
      rule: "contrast",
      severity: "error",
      elementId: el.id,
      measured: shown,
      expected: HARD_LIMITS.minContrastUi,
      message: `Marginea pentru ${name(el, false)} abia se vede: contrastul e ${shown}:1, trebuie cel puțin ${HARD_LIMITS.minContrastUi}:1.`,
    },
  ];
}

export function checkTargetSize(el: ElementInfo, t: AuditThresholds): AuditIssue[] {
  if (!el.interactive) return [];
  const { width, height } = el.rect;
  if (width >= t.minTargetPx - RECT_EPS && height >= t.minTargetPx - RECT_EPS) return [];
  const measured = `${round(width)}×${round(height)}px`;
  return [
    {
      rule: "target-size",
      severity: "error",
      elementId: el.id,
      measured,
      expected: t.minTargetPx,
      message: `${name(el)} are ${measured}, greu de atins; minimul tău e ${t.minTargetPx}px.`,
    },
  ];
}

export function checkClipped(el: ElementInfo, f: DomFacts = {}): AuditIssue[] {
  if (!el.clipped || f.intentionalOverflow || !el.label.trim()) return [];
  return [
    {
      rule: "clipped",
      severity: "error",
      elementId: el.id,
      measured: "tăiat",
      expected: "întreg",
      message: `${name(el)} nu încape și textul e tăiat.`,
    },
  ];
}

export function checkOffscreen(el: ElementInfo, viewport: UISnapshot["viewport"]): AuditIssue[] {
  if (!el.interactive) return [];
  const left = el.rect.x;
  const right = el.rect.x + el.rect.width;
  if (left >= -OFFSCREEN_EPS && right <= viewport.width + OFFSCREEN_EPS) return [];
  return [
    {
      rule: "offscreen",
      severity: "error",
      elementId: el.id,
      measured: `${round(left)}–${round(right)}px`,
      expected: `0–${viewport.width}px`,
      message: `${name(el)} iese din ecran pe orizontală.`,
    },
  ];
}

export function checkLineHeight(el: ElementInfo, t: AuditThresholds, f: DomFacts = {}): AuditIssue[] {
  if (f.lineHeight === undefined || !isContentText(el)) return [];
  if (f.lineHeight >= t.minLineHeight - LINE_HEIGHT_EPS) return [];
  return [
    {
      rule: "line-height",
      severity: "warning",
      elementId: el.id,
      measured: round(f.lineHeight, 2),
      expected: t.minLineHeight,
      message: `${name(el)} are rândurile prea înghesuite (${round(f.lineHeight, 2)}); minimul e ${t.minLineHeight}.`,
    },
  ];
}

/** Perechi de elemente interactive care se acoperă (mai mult de 4px²). Un element din altul nu contează. */
export function checkOverlap(elements: ElementInfo[]): AuditIssue[] {
  const targets = elements.filter((e) => e.interactive && e.rect.width > 0 && e.rect.height > 0);
  const issues: AuditIssue[] = [];
  for (let i = 0; i < targets.length; i++) {
    for (let j = i + 1; j < targets.length; j++) {
      const a = targets[i];
      const b = targets[j];
      if (contains(a.rect, b.rect) || contains(b.rect, a.rect)) continue;
      const area = intersectionArea(a.rect, b.rect);
      if (area <= OVERLAP_MAX_AREA) continue;
      issues.push({
        rule: "overlap",
        severity: "error",
        elementId: b.id,
        measured: `${round(area)}px² cu ${a.id}`,
        expected: `≤ ${OVERLAP_MAX_AREA}px²`,
        message: `${name(b)} se suprapune cu ${name(a, false)}; se poate apăsa greșit.`,
      });
    }
  }
  return issues;
}

// ---------- ajutătoare ----------

export function intersectionArea(a: Rect, b: Rect): number {
  const w = Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x);
  const h = Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y);
  return w > 0 && h > 0 ? w * h : 0;
}

function contains(outer: Rect, inner: Rect): boolean {
  return (
    inner.x >= outer.x - RECT_EPS &&
    inner.y >= outer.y - RECT_EPS &&
    inner.x + inner.width <= outer.x + outer.width + RECT_EPS &&
    inner.y + inner.height <= outer.y + outer.height + RECT_EPS
  );
}

/** Contrastul calculat de registru sau, dacă lipsește, din culori. */
function textContrastOf(el: ElementInfo): number | undefined {
  if (typeof el.contrast === "number" && Number.isFinite(el.contrast)) return el.contrast;
  if (el.color && el.background && parseColor(el.color) && parseColor(el.background)) {
    return contrastRatio(el.color, el.background);
  }
  return undefined;
}

function hasText(el: ElementInfo): boolean {
  return typeof el.fontPx === "number" && el.label.trim() !== "" && el.role !== "img";
}

/** Text de citit (paragrafe, mesaje), nu butoane sau titluri. */
function isContentText(el: ElementInfo): boolean {
  return hasText(el) && !el.interactive && el.role !== "heading";
}

function isNavigation(id: string): boolean {
  return id.startsWith("nav.") || id.startsWith("menu.");
}

/** „Butonul «Trimite»” / „«Trimite»”, scurt, pentru mesajele către utilizator și agent. */
function name(el: ElementInfo, capital = true): string {
  const label = el.label.trim();
  const short = label.length > 30 ? label.slice(0, 29) + "…" : label;
  const quoted = short ? `„${short}”` : el.id;
  const kind = ROLE_NAMES[el.role];
  if (!kind) return capital ? `Elementul ${quoted}` : `elementul ${quoted}`;
  return `${capital ? kind[0].toUpperCase() + kind.slice(1) : kind} ${quoted}`;
}

const ROLE_NAMES: Record<string, string> = {
  button: "butonul",
  link: "legătura",
  heading: "titlul",
  textbox: "câmpul",
  img: "imaginea",
  menuitem: "opțiunea",
  tab: "fila",
  checkbox: "căsuța",
  switch: "comutatorul",
};

function round(v: number, digits = 0): number {
  const p = 10 ** digits;
  return Math.round(v * p) / p;
}
