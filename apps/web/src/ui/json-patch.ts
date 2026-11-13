// Aplică un JSON Patch (subsetul RFC 6902 din contracte: replace, add, remove) pe o COPIE a UIConfig.
// Nu aruncă niciodată: patch-ul vine de la model, deci orice greșeală devine o încălcare pe care agentul o citește.
// Forma config-ului rezultat NU se verifică aici, ci în config-shape.ts (un singur loc pentru „tipul greșit”).

import type { JsonPatchOp, UIConfig } from "@uishapeshifter/contracts";
import type { ConfigViolation, GateResult } from "./config-violation";

const OPS: ReadonlySet<string> = new Set<JsonPatchOp["op"]>(["replace", "add", "remove"]);
/** Le schimbă doar store-ul (revision la fiecare aplicare, version e a contractului). */
const STORE_OWNED_ROOTS: ReadonlySet<string> = new Set(["revision", "version"]);
/** Chei care ar schimba prototipul obiectului în loc să seteze un câmp. */
const FORBIDDEN_KEYS: ReadonlySet<string> = new Set(["__proto__", "constructor", "prototype"]);
const ARRAY_INDEX = /^(0|[1-9][0-9]*)$/;
const APPEND_INDEX = "-";
/** Forma din specs/02: /modules/@feed/visible = modulul cu id "feed", indiferent de poziție. */
const ID_SEGMENT_PREFIX = "@";
const ID_ADDRESSED_ARRAY = "modules";

type Container = Record<string, unknown> | unknown[];

/**
 * Întoarce config-ul după patch, încă neverificat ca formă (de aceea `unknown`).
 * Patch-ul e atomic: la prima operație greșită se oprește și nu întoarce nimic aplicat parțial.
 */
export function applyJsonPatch(config: UIConfig, ops: readonly JsonPatchOp[]): GateResult<unknown> {
  if (!Array.isArray(ops)) {
    return fail({
      rule: "invalid-op",
      path: "",
      received: ops,
      message: "Patch-ul trebuie să fie o listă de operații.",
    });
  }
  const draft: unknown = structuredClone(config);
  for (const op of ops) {
    const violation = applyOne(draft, op);
    if (violation) return fail(violation);
  }
  return { ok: true, config: draft };
}

function applyOne(document: unknown, op: unknown): ConfigViolation | null {
  if (!isRecord(op) || typeof op.op !== "string" || !OPS.has(op.op) || typeof op.path !== "string") {
    return {
      rule: "invalid-op",
      path: isRecord(op) && typeof op.path === "string" ? op.path : "",
      received: op,
      limit: "op: replace | add | remove, path: JSON Pointer",
      message: "Operația nu e validă: folosește op replace, add sau remove și o cale de forma /theme/baseFontPx.",
    };
  }
  const path = op.path;
  if ((op.op === "replace" || op.op === "add") && !("value" in op)) {
    return { rule: "invalid-op", path, received: op, message: `Operația ${op.op} are nevoie de câmpul value.` };
  }

  const segments = parsePointer(path);
  if (!segments || segments.length === 0) {
    return invalidPath(path, "Calea trebuie să înceapă cu / și să numească un câmp, ex. /theme/baseFontPx.");
  }
  if (STORE_OWNED_ROOTS.has(segments[0])) {
    return invalidPath(path, `Câmpul /${segments[0]} îl schimbă doar aplicația, nu un patch.`);
  }
  if (segments.some((s) => FORBIDDEN_KEYS.has(s))) return invalidPath(path, "Calea conține un nume de câmp interzis.");

  // Coborâm până la părintele țintei; ultimul segment e cheia sau indexul pe care operăm.
  let parent: unknown = document;
  for (let i = 0; i < segments.length - 1; i++) {
    const key = resolveSegment(parent, segments[i], segments.slice(0, i));
    if (key === null || !hasChild(parent, key))
      return invalidPath(path, `Nu există ${pointerOf(segments.slice(0, i + 1))}.`);
    parent = childOf(parent as Container, key);
  }
  if (!isContainer(parent)) return invalidPath(path, `${pointerOf(segments.slice(0, -1))} nu are câmpuri.`);

  const last = segments[segments.length - 1];
  const parentSegments = segments.slice(0, -1);
  const cloned = op.op === "remove" ? { ok: true as const, value: undefined } : cloneValue(op.value);
  if (!cloned.ok) {
    return {
      rule: "invalid-type",
      path,
      received: op.value,
      message: "Valoarea nu e JSON (are funcții sau referințe).",
    };
  }
  const value = cloned.value;

  if (Array.isArray(parent)) {
    if (op.op === "add" && last === APPEND_INDEX) {
      parent.push(value);
      return null;
    }
    const index = resolveSegment(parent, last, parentSegments);
    const limit = op.op === "add" ? parent.length : parent.length - 1; // add poate insera și la final
    if (index === null || Number(index) > limit) return invalidPath(path, `Nu există ${path}.`);
    if (op.op === "add") parent.splice(Number(index), 0, value);
    else if (op.op === "replace") parent[Number(index)] = value;
    else parent.splice(Number(index), 1);
    return null;
  }

  const exists = Object.hasOwn(parent, last);
  if (op.op !== "add" && !exists) return invalidPath(path, `Nu există ${path}; pentru un câmp nou folosește add.`);
  if (op.op === "remove") delete parent[last];
  else parent[last] = value;
  return null;
}

/** JSON Pointer → segmente decodate (~1 = /, ~0 = ~). `null` dacă nu începe cu /. */
function parsePointer(path: string): string[] | null {
  if (!path.startsWith("/")) return null;
  return path
    .slice(1)
    .split("/")
    .map((s) => s.replace(/~1/g, "/").replace(/~0/g, "~"));
}

/**
 * Pentru liste: indexul ca text, sau `null` dacă segmentul nu e un index valid.
 * În /modules acceptăm și @<id>, căutat în config-ul de acum (operațiile anterioare pot fi mutat modulele).
 * Pentru obiecte, segmentul e chiar cheia.
 */
function resolveSegment(container: unknown, segment: string, parentSegments: string[]): string | null {
  if (!Array.isArray(container)) return segment;
  const isModules = parentSegments.length === 1 && parentSegments[0] === ID_ADDRESSED_ARRAY;
  if (isModules && segment.startsWith(ID_SEGMENT_PREFIX)) {
    const id = segment.slice(ID_SEGMENT_PREFIX.length);
    const index = container.findIndex((m) => isRecord(m) && m.id === id);
    return index === -1 ? null : String(index);
  }
  return ARRAY_INDEX.test(segment) ? segment : null;
}

function hasChild(container: unknown, key: string): boolean {
  if (Array.isArray(container)) return Number(key) < container.length;
  return isRecord(container) && Object.hasOwn(container, key);
}

function childOf(container: Container, key: string): unknown {
  return Array.isArray(container) ? container[Number(key)] : container[key];
}

/** Copiem valoarea, ca obiectul primit să nu rămână legat de config. */
function cloneValue(value: unknown): { ok: true; value: unknown } | { ok: false } {
  try {
    return { ok: true, value: structuredClone(value) };
  } catch {
    return { ok: false };
  }
}

function pointerOf(segments: string[]): string {
  return segments.length === 0
    ? "rădăcina"
    : "/" + segments.map((s) => s.replace(/~/g, "~0").replace(/\//g, "~1")).join("/");
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isContainer(value: unknown): value is Container {
  return Array.isArray(value) || isRecord(value);
}

function invalidPath(path: string, message: string): ConfigViolation {
  return { rule: "invalid-path", path, received: undefined, message };
}

function fail(violation: ConfigViolation): GateResult<unknown> {
  return { ok: false, violations: [violation] };
}
