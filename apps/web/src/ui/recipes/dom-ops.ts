// Operațiile de structură ale rețetei (B6, specs/03): remove, move, wrap, setText, setAttr pe pagina unui site real.
// Fiecare operație aplicată ține tot ce trebuie ca s-o anuleze exact; nu scoatem niciodată noduri ale site-ului din
// DOM (site-urile cu React se strică la noduri detașate): `remove` doar ASCUNDE, iar `move`/`wrap` lasă un marcaj
// (comentariu HTML) pe locul vechi. insertHtml, bind și inject vin în B3.

import {
  DOM_OP_LIMITS,
  SETTABLE_ATTRS,
  type DomOp,
  type DomPlace,
  type DomPosition,
  type OpSkipReason,
  type SkippedOp,
  type WrapTag,
} from "@uishapeshifter/contracts";
import { OUR_INTERFACE_MARKERS } from "../../validation";

/** Atributul pus de `remove`; conține „uishapeshifter”, deci CSS-ul agentului nu-l poate anula (validateCss). */
export const HIDDEN_ATTR = "data-uishapeshifter-hidden";
export const HIDDEN_STYLE_ID = "uishapeshifter-hidden";
const HIDDEN_CSS = `[${HIDDEN_ATTR}] { display: none !important; }`;
/** Textul comentariului lăsat pe locul vechi al unui element mutat sau împachetat. */
export const MARKER_TEXT = "uishapeshifter:marcaj";
export const SHAPE_ATTR = "data-shape";

const SHAPE_ID = /^[a-z0-9-]+$/;
const POSITIONS: Record<DomPosition, true> = { before: true, after: true, prepend: true, append: true };
const WRAP_TAGS: Record<WrapTag, true> = { div: true, section: true, nav: true, aside: true, header: true, ul: true };
const B3_OPS: ReadonlySet<string> = new Set(["insertHtml", "bind", "inject"]);

export type OpOutcome = { ok: true } | { ok: false; reason: OpSkipReason; message: string };

// ---------- validarea (înainte de aplicare) ----------

type Check = { ok: true; op: DomOp } | { ok: false; reason: OpSkipReason; message: string };

/**
 * Forma unei operații venite de la model: câmpurile, limitele, `SETTABLE_ATTRS`, id-urile, selectorii (sintaxă și
 * fără interfața noastră). Nu se uită dacă elementele există: asta se vede la aplicare.
 */
export function checkOp(raw: unknown, doc: Document): Check {
  if (!isRecord(raw) || typeof raw.op !== "string") return invalid("Operația trebuie să fie un obiect cu câmpul op.");
  if (B3_OPS.has(raw.op))
    return invalid(`${raw.op} vine în B3; deocamdată folosește remove, move, wrap, setText, setAttr.`);

  switch (raw.op) {
    case "remove":
      return withSelectors(doc, [raw.selector], () => ({ op: "remove", selector: raw.selector as string }));
    case "move": {
      const to = place(raw.to);
      if (!to) return invalid("move cere to: { selector, position: before | after | prepend | append }.");
      return withSelectors(doc, [raw.selector, to.selector], () => ({
        op: "move",
        selector: raw.selector as string,
        to,
      }));
    }
    case "wrap": {
      if (!Array.isArray(raw.selectors) || raw.selectors.length === 0) return invalid("wrap cere selectors (listă).");
      const idProblem = shapeIdProblem(raw.id);
      if (idProblem) return invalid(idProblem);
      if (raw.tag !== undefined && !(typeof raw.tag === "string" && Object.hasOwn(WRAP_TAGS, raw.tag))) {
        return invalid(`tag e unul din: ${Object.keys(WRAP_TAGS).join(", ")}.`);
      }
      return withSelectors(doc, raw.selectors, () => ({
        op: "wrap",
        selectors: raw.selectors as string[],
        id: raw.id as string,
        ...(raw.tag ? { tag: raw.tag as WrapTag } : {}),
      }));
    }
    case "setText":
      if (typeof raw.text !== "string" || raw.text.length > DOM_OP_LIMITS.maxTextChars) {
        return invalid(`setText cere text de cel mult ${DOM_OP_LIMITS.maxTextChars} de caractere, fără HTML.`);
      }
      return withSelectors(doc, [raw.selector], () => ({
        op: "setText",
        selector: raw.selector as string,
        text: raw.text as string,
      }));
    case "setAttr":
      if (typeof raw.name !== "string" || !(SETTABLE_ATTRS as readonly string[]).includes(raw.name)) {
        return invalid(`setAttr poate schimba doar: ${SETTABLE_ATTRS.join(", ")}.`);
      }
      if (typeof raw.value !== "string" || raw.value.length > DOM_OP_LIMITS.maxTextChars) {
        return invalid(`value e text de cel mult ${DOM_OP_LIMITS.maxTextChars} de caractere.`);
      }
      return withSelectors(doc, [raw.selector], () => ({
        op: "setAttr",
        selector: raw.selector as string,
        name: raw.name as (typeof SETTABLE_ATTRS)[number],
        value: raw.value as string,
      }));
    default:
      return invalid(`Operația „${raw.op}” nu există.`);
  }
}

/**
 * Operațiile noi dintr-un apel apply_ops: cele bune (cu poziția lor în listă) și cele sărite, cu motiv.
 * `existing` = operațiile deja în rețetă: aceeași operație încă o dată e ALREADY_APPLIED, iar un id de `wrap` nu
 * se poate refolosi.
 */
export function checkOps(
  ops: readonly unknown[],
  existing: readonly DomOp[],
  doc: Document,
): { accepted: { index: number; op: DomOp }[]; skipped: SkippedOp[] } {
  const accepted: { index: number; op: DomOp }[] = [];
  const skipped: SkippedOp[] = [];
  const seen = new Set(existing.map(key));
  const shapeIds = new Set(existing.flatMap((op) => (op.op === "wrap" ? [op.id] : [])));
  ops.forEach((raw, index) => {
    const check = checkOp(raw, doc);
    if (!check.ok) return void skipped.push({ index, reason: check.reason, message: check.message });
    if (seen.has(key(check.op))) {
      return void skipped.push({ index, reason: "ALREADY_APPLIED", message: "Operația e deja în rețetă." });
    }
    if (
      check.op.op === "wrap" &&
      (shapeIds.has(check.op.id) || doc.querySelector(`[${SHAPE_ATTR}="${check.op.id}"]`))
    ) {
      return void skipped.push({
        index,
        reason: "INVALID",
        message: `Id-ul „${check.op.id}” e deja folosit; alege altul.`,
      });
    }
    seen.add(key(check.op));
    if (check.op.op === "wrap") shapeIds.add(check.op.id);
    accepted.push({ index, op: check.op });
  });
  return { accepted, skipped };
}

/** Cheia unei operații pentru „e deja în rețetă”: JSON cu cheile sortate, ca ordinea câmpurilor să nu conteze. */
function key(op: DomOp): string {
  return JSON.stringify(op, (_k, value: unknown) =>
    isRecord(value) ? Object.fromEntries(Object.entries(value).sort(([a], [b]) => a.localeCompare(b))) : value,
  );
}

function withSelectors(doc: Document, selectors: unknown[], build: () => DomOp): Check {
  for (const selector of selectors) {
    if (typeof selector !== "string" || !selector.trim()) return invalid("Fiecare selector trebuie să fie text.");
    const lower = selector.toLowerCase();
    if (OUR_INTERFACE_MARKERS.some((marker) => lower.includes(marker))) {
      return invalid(`Selectorul „${selector}” țintește interfața extensiei. Schimbă doar elementele site-ului.`);
    }
    try {
      doc.querySelector(selector);
    } catch {
      return invalid(`Selectorul „${selector}” nu e valid. Folosește un selector din snapshot.`);
    }
  }
  return { ok: true, op: build() };
}

function place(raw: unknown): DomPlace | null {
  if (!isRecord(raw) || typeof raw.selector !== "string") return null;
  if (typeof raw.position !== "string" || !Object.hasOwn(POSITIONS, raw.position)) return null;
  return { selector: raw.selector, position: raw.position as DomPosition };
}

function shapeIdProblem(id: unknown): string | null {
  if (typeof id !== "string" || !SHAPE_ID.test(id) || id.length > DOM_OP_LIMITS.maxShapeIdChars) {
    return `id are doar litere mici, cifre și „-”, cel mult ${DOM_OP_LIMITS.maxShapeIdChars} de caractere.`;
  }
  return null;
}

// ---------- aplicarea și anularea ----------

/** O operație aplicată: cum se anulează și cum aflăm dacă site-ul a stricat-o între timp. */
export interface AppliedOp {
  undo(): void;
  intact(): boolean;
}

export interface DomOpsApplier {
  /** Anulează tot ce e aplicat (în ordine inversă), apoi aplică `ops` în ordine. Un rezultat pe operație. */
  sync(ops: readonly DomOp[]): OpOutcome[];
  /** Anulează tot ce e aplicat, în ordine inversă. */
  undoAll(): void;
  /**
   * Pentru paginile care își schimbă singure conținutul: NU anulează tot. Aplică, în ordinea din rețetă, doar operațiile
   * care lipsesc. Cele care n-au fost încă aplicate (elementul nu exista) se încearcă din nou; cele aplicate pe care
   * site-ul le-a stricat se refac doar dacă `allowRepair` (limita anti-buclă o ține motorul).
   */
  reconcile(ops: readonly DomOp[], options: { allowRepair: boolean }): ReconcileResult;
}

export interface ReconcileResult {
  /** Operații aplicate acum pentru prima dată (elementul a apărut între timp). */
  added: number;
  /** Operații aplicate pe care site-ul le-a stricat și pe care le-am refăcut. */
  repaired: number;
  /** Operații stricate de site lăsate așa, fiindcă refacerea nu era permisă. */
  brokenLeft: number;
}

export interface DomOpsOptions {
  doc?: Document;
  /** Elementele interfeței noastre (gazda shadow etc.): nu le atingem. Implicit: id-ul conține „uishapeshifter”. */
  isOurElement?: (element: Element) => boolean;
}

export function createDomOpsApplier(options: DomOpsOptions = {}): DomOpsApplier & {
  /** Pentru reaplicare (pasul următor): ce e aplicat acum, pe poziția din listă. */
  readonly applied: ReadonlyMap<number, AppliedOp>;
} {
  const doc = options.doc ?? document;
  const isOurs = options.isOurElement ?? ((el: Element) => el.closest("[id*='uishapeshifter']") !== null);
  const applied = new Map<number, AppliedOp>();

  function undoAll() {
    for (const index of [...applied.keys()].sort((a, b) => b - a)) {
      applied.get(index)?.undo();
      applied.delete(index);
    }
  }

  return {
    applied,
    undoAll,
    reconcile(ops, { allowRepair }) {
      const result: ReconcileResult = { added: 0, repaired: 0, brokenLeft: 0 };
      ops.forEach((op, index) => {
        const current = applied.get(index);
        if (current?.intact()) return;
        if (current) {
          if (!allowRepair) return void result.brokenLeft++;
          current.undo(); // curăță ce a rămas (marcaje, container), fără să readucă noduri scoase de site
          applied.delete(index);
        }
        const outcome = applyOne(op);
        if (!outcome.ok) return;
        applied.set(index, outcome.applied);
        if (current) result.repaired++;
        else result.added++;
      });
      return result;
    },
    sync(ops) {
      undoAll();
      return ops.map((op, index) => {
        const result = applyOne(op);
        if (result.ok) applied.set(index, result.applied);
        return result.ok ? { ok: true } : result;
      });
    },
  };

  function applyOne(
    op: DomOp,
  ): { ok: true; applied: AppliedOp } | { ok: false; reason: OpSkipReason; message: string } {
    switch (op.op) {
      case "remove":
        return remove(op.selector);
      case "move":
        return move(op.selector, op.to);
      case "wrap":
        return wrap(op.selectors, op.id, op.tag ?? "div");
      case "setText":
        return setText(op.selector, op.text);
      case "setAttr":
        return setAttr(op.selector, op.name, op.value);
      default:
        return skip("INVALID", `${op.op} vine în B3.`);
    }
  }

  /** Toate elementele site-ului care se potrivesc (fără ale noastre). */
  function matches(selector: string): Element[] {
    return [...doc.querySelectorAll(selector)].filter((el) => !isOurs(el));
  }

  /** Exact un element, altfel motivul pentru `skipped`. */
  function single(selector: string, missing: OpSkipReason = "SELECTOR_NOT_FOUND") {
    const found = matches(selector);
    if (found.length === 0) return skip(missing, `Nu găsesc „${selector}” pe pagină. Ia un selector din snapshot nou.`);
    if (found.length > 1) {
      return skip("SELECTOR_AMBIGUOUS", `„${selector}” prinde ${found.length} elemente; alege un selector mai precis.`);
    }
    return { ok: true as const, element: found[0]! };
  }

  function remove(selector: string) {
    const found = matches(selector);
    if (found.length === 0) return skip("SELECTOR_NOT_FOUND", `Nu găsesc „${selector}” pe pagină.`);
    ensureHiddenStyle();
    const hiddenBefore = found.map((el) => el.hasAttribute(HIDDEN_ATTR));
    found.forEach((el) => el.setAttribute(HIDDEN_ATTR, ""));
    return done({
      undo: () => found.forEach((el, i) => !hiddenBefore[i] && el.removeAttribute(HIDDEN_ATTR)),
      intact: () => found.every((el) => el.isConnected && el.hasAttribute(HIDDEN_ATTR)),
    });
  }

  function move(selector: string, to: DomPlace) {
    const source = single(selector);
    if (!source.ok) return source;
    const target = single(to.selector, "TARGET_NOT_FOUND");
    if (!target.ok) return target;
    const el = source.element;
    if (el === target.element || el.contains(target.element)) {
      return skip("INVALID", "Elementul nu se poate muta în el însuși.");
    }
    const marker = leaveMarker(el);
    put(el, target.element, to.position);
    return done({
      undo: () => restore(el, marker),
      intact: () => el.isConnected && isPlaced(el, target.element, to.position),
    });
  }

  function wrap(selectors: string[], id: string, tag: WrapTag) {
    const elements: Element[] = [];
    for (const selector of selectors) {
      const found = single(selector);
      if (!found.ok) return found;
      elements.push(found.element);
    }
    if (
      new Set(elements).size !== elements.length ||
      elements.some((a) => elements.some((b) => a !== b && a.contains(b)))
    ) {
      return skip("INVALID", "Elementele din wrap trebuie să fie diferite și să nu fie unul în altul.");
    }
    const markers = elements.map(leaveMarker);
    const container = doc.createElement(tag);
    container.setAttribute(SHAPE_ATTR, id);
    markers[0]!.after(container);
    container.append(...elements);
    return done({
      undo: () => {
        elements.forEach((el, i) => restore(el, markers[i]!));
        container.remove();
      },
      intact: () => container.isConnected && elements.every((el) => el.parentElement === container),
    });
  }

  function setText(selector: string, text: string) {
    const found = matches(selector);
    if (found.length === 0) return skip("SELECTOR_NOT_FOUND", `Nu găsesc „${selector}” pe pagină.`);
    if (found.some((el) => el.children.length > 0)) {
      return skip("INVALID", `„${selector}” are alte elemente înăuntru; țintește elementul care are doar textul.`);
    }
    const before = found.map((el) => [...el.childNodes]);
    found.forEach((el) => (el.textContent = text));
    return done({
      undo: () => found.forEach((el, i) => el.replaceChildren(...before[i]!)),
      intact: () => found.every((el) => el.isConnected && el.textContent === text),
    });
  }

  function setAttr(selector: string, name: string, value: string) {
    const found = matches(selector);
    if (found.length === 0) return skip("SELECTOR_NOT_FOUND", `Nu găsesc „${selector}” pe pagină.`);
    const before = found.map((el) => el.getAttribute(name));
    found.forEach((el) => el.setAttribute(name, value));
    return done({
      undo: () =>
        found.forEach((el, i) => {
          const old = before[i];
          if (old === null || old === undefined) el.removeAttribute(name);
          else el.setAttribute(name, old);
        }),
      intact: () => found.every((el) => el.isConnected && el.getAttribute(name) === value),
    });
  }

  function ensureHiddenStyle() {
    if (doc.getElementById(HIDDEN_STYLE_ID)) return;
    const style = doc.createElement("style");
    style.id = HIDDEN_STYLE_ID;
    style.textContent = HIDDEN_CSS;
    (doc.head ?? doc.documentElement).appendChild(style);
  }

  function leaveMarker(el: Element): Comment {
    const marker = doc.createComment(MARKER_TEXT);
    el.before(marker);
    return marker;
  }
}

/**
 * Pune elementul înapoi pe locul marcajului. Dacă site-ul a scos între timp marcajul sau elementul (l-a randat din
 * nou), nu readucem un nod pe care site-ul l-a aruncat: doar curățăm marcajul.
 */
function restore(el: Element, marker: Comment) {
  if (marker.isConnected && el.isConnected) marker.replaceWith(el);
  else marker.remove();
}

function put(el: Element, target: Element, position: DomPosition) {
  if (position === "before") target.before(el);
  else if (position === "after") target.after(el);
  else if (position === "prepend") target.prepend(el);
  else target.append(el);
}

function isPlaced(el: Element, target: Element, position: DomPosition): boolean {
  if (position === "before") return el.nextElementSibling === target;
  if (position === "after") return target.nextElementSibling === el;
  if (position === "prepend") return target.firstElementChild === el;
  return target.lastElementChild === el;
}

function done(applied: AppliedOp) {
  return { ok: true as const, applied };
}

function skip(reason: OpSkipReason, message: string) {
  return { ok: false as const, reason, message };
}

function invalid(message: string): Check {
  return { ok: false, reason: "INVALID", message };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
