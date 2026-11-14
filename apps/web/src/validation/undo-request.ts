// Anularea unei singure cereri din istoricul rețetei, nu doar a ultimei: „scoate ce ai făcut când am zis X”, iar ce a
// cerut omul după rămâne. „Anulez” de azi (revertTo) întoarce rețeta la o revizie, deci aruncă și tot ce a urmat.
// Funcții pure: istoricul intră, rețeta refăcută iese, trecută din nou prin validarea CSS (C5). Motorul de rețete (B)
// o salvează ca revizie nouă, deci și anularea se poate anula.

import type { CssDropped, DomOp, RecipeRevision } from "@uishapeshifter/contracts";
import { validateCss } from "./css";

/** O cerere a omului, cu reviziile ei (o rulare a agentului poate face mai multe apeluri apply_css / apply_ops). */
export interface RequestEntry {
  /** `runId`-ul rulării; o revizie fără rulare (preferințele de bază) e o cerere singură, „revizia-<n>”. */
  requestId: string;
  /** Ce a cerut omul, din prima revizie a cererii. */
  reason: string;
  at: string;
  revisions: number[];
}

export interface RecipeWithoutRequest {
  css: string;
  ops: DomOp[];
  /** Ce a scos validarea din foaia refăcută (de obicei nimic: fiecare bucată a trecut deja la apply_css). */
  dropped: CssDropped[];
  /** Operații de după cerere care țineau de un element adăugat de ea (`data-shape`, `bind`): fără el nu mai au sens. */
  droppedOps: DomOp[];
}

export type UndoRequestResult = { ok: true; recipe: RecipeWithoutRequest } | { ok: false; message: string };

/**
 * O revizie făcută de anularea unei cereri are `runId` = prefixul + cererea scoasă. Nu e o cerere a omului: lista o
 * ascunde, iar refacerea o sare și scoate din nou toate cererile anulate, ca anulările să se adune.
 */
export const UNDO_RUN_PREFIX = "anulare:";

/** Separatorul pus de motorul de rețete între foaia veche și bucata nouă la `mode: "append"` (recipe-engine.ts). */
const CSS_APPEND_SEPARATOR = "\n";

function requestIdOf(revision: RecipeRevision): string {
  return revision.runId ?? `revizia-${revision.revision}`;
}

function isUndoRevision(revision: RecipeRevision): boolean {
  return revision.runId?.startsWith(UNDO_RUN_PREFIX) ?? false;
}

/** Cererile scoase deja, din reviziile de anulare. */
export function undoneRequests(revisions: RecipeRevision[]): string[] {
  return revisions.filter(isUndoRevision).map((revision) => revision.runId!.slice(UNDO_RUN_PREFIX.length));
}

function byRevision(revisions: RecipeRevision[]): RecipeRevision[] {
  return [...revisions].sort((a, b) => a.revision - b.revision);
}

/**
 * Cererile din istoric care încă au efect, în ordinea în care au fost făcute: lista din panou, cu „Anulez” pe fiecare.
 * Fără reviziile de anulare și fără cererile scoase de ele.
 */
export function requestHistory(revisions: RecipeRevision[]): RequestEntry[] {
  const undone = new Set(undoneRequests(revisions));
  const entries = new Map<string, RequestEntry>();
  for (const revision of byRevision(revisions)) {
    if (isUndoRevision(revision) || undone.has(requestIdOf(revision))) continue;
    const id = requestIdOf(revision);
    const entry = entries.get(id);
    if (entry) entry.revisions.push(revision.revision);
    else entries.set(id, { requestId: id, reason: revision.reason, at: revision.at, revisions: [revision.revision] });
  }
  return [...entries.values()];
}

/** Ce a adus o revizie față de cea dinainte: o bucată adăugată la coadă sau o înlocuire întreagă. */
type Delta<T> = { kind: "append"; added: T } | { kind: "replace"; value: T };

function cssDelta(previous: string, next: string): Delta<string> {
  if (!previous) return { kind: "append", added: next };
  if (next === previous) return { kind: "append", added: "" };
  if (next.startsWith(previous + CSS_APPEND_SEPARATOR)) {
    return { kind: "append", added: next.slice(previous.length + CSS_APPEND_SEPARATOR.length) };
  }
  return { kind: "replace", value: next };
}

function sameOp(a: DomOp, b: DomOp): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

function opsDelta(previous: DomOp[], next: DomOp[]): Delta<DomOp[]> {
  const isPrefix = previous.length <= next.length && previous.every((op, i) => sameOp(op, next[i]!));
  return isPrefix ? { kind: "append", added: next.slice(previous.length) } : { kind: "replace", value: next };
}

function joinCss(base: string, added: string): string {
  if (!added) return base;
  return base ? `${base}${CSS_APPEND_SEPARATOR}${added}` : added;
}

/** Id-urile elementelor adăugate de niște operații (wrap, insertHtml, inject). */
function shapeIdsOf(ops: DomOp[]): Set<string> {
  const ids = new Set<string>();
  for (const op of ops) if (op.op === "wrap" || op.op === "insertHtml" || op.op === "inject") ids.add(op.id);
  return ids;
}

/** Operația se sprijină pe un element adăugat de cererea anulată: îl leagă, îl mută, se pune lângă el. */
function dependsOn(op: DomOp, shapeIds: Set<string>): boolean {
  if (op.op === "bind" && shapeIds.has(op.from)) return true;
  const selectors: string[] = [];
  if ("selector" in op) selectors.push(op.selector);
  if (op.op === "wrap") selectors.push(...op.selectors);
  if ("to" in op && typeof op.to === "object") selectors.push(op.to.selector);
  if ("at" in op) selectors.push(op.at.selector);
  return selectors.some((selector) => [...shapeIds].some((id) => selector.includes(`data-shape="${id}"`)));
}

/**
 * Rețeta de acum fără cererea `requestId` și fără cele anulate înainte: refacem istoricul revizie cu revizie și sărim
 * bucățile lor. Cererile de după rămân. O revizie „replace” de după cerere (agentul a rescris toată foaia) nu se poate
 * despărți: rămâne cum e. Istoricul păstrează doar ultimele `RECIPE_LIMITS.maxRevisions` revizii; o cerere mai veche nu
 * se mai poate scoate singură (rămâne „Revino la original”).
 */
export function recipeWithoutRequest(revisions: RecipeRevision[], requestId: string): UndoRequestResult {
  const ordered = byRevision(revisions);
  if (!ordered.some((revision) => !isUndoRevision(revision) && requestIdOf(revision) === requestId)) {
    return { ok: false, message: "Cererea nu e în istoricul rețetei acestui site." };
  }
  const skipped = new Set([...undoneRequests(revisions), requestId]);
  // Prima revizie păstrată poate conține și cereri mai vechi, ieșite din istoric: n-o putem despărți.
  const first = ordered[0]!;
  if (first.revision > 1 && skipped.has(requestIdOf(first))) {
    return { ok: false, message: "Cererea e prea veche ca să fie scoasă singură; se poate reveni la original." };
  }

  let previousCss = "";
  let previousOps: DomOp[] = [];
  let css = "";
  let ops: DomOp[] = [];
  const removedShapes = new Set<string>();
  const droppedOps: DomOp[] = [];
  for (const revision of ordered) {
    const nextOps = revision.ops ?? [];
    const cssChange = cssDelta(previousCss, revision.css);
    const opsChange = opsDelta(previousOps, nextOps);
    previousCss = revision.css;
    previousOps = nextOps;

    // O anulare de mai devreme: rezultatul ei îl refacem chiar acum; ce vine după ea s-a adăugat la foaia ei.
    if (isUndoRevision(revision)) continue;
    if (skipped.has(requestIdOf(revision))) {
      if (opsChange.kind === "append") for (const id of shapeIdsOf(opsChange.added)) removedShapes.add(id);
      continue;
    }
    css = cssChange.kind === "append" ? joinCss(css, cssChange.added) : cssChange.value;
    const added = opsChange.kind === "append" ? opsChange.added : opsChange.value;
    const kept = added.filter((op) => {
      if (!dependsOn(op, removedShapes)) return true;
      droppedOps.push(op);
      return false;
    });
    ops = opsChange.kind === "append" ? [...ops, ...kept] : kept;
  }

  const validated = validateCss(css);
  return { ok: true, recipe: { css: validated.css, ops, dropped: validated.dropped, droppedOps } };
}
