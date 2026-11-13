// O încălcare găsită de poarta din store (specs/02, punctul 3). Contractul are `ToolError.details: unknown`,
// așa că forma încălcării o fixăm aici: agentul o primește în `details` la LIMIT_VIOLATION și încearcă altceva.

export type ViolationRule =
  // aceleași nume ca regulile auditului (AuditRule), ca agentul să le recunoască
  | "min-font"
  | "contrast"
  | "target-size"
  | "line-height"
  // doar la poartă
  | "max-font"
  | "pinned-hidden"
  | "duplicate-id"
  | "invalid-path"
  | "invalid-type"
  | "invalid-op";

export interface ConfigViolation {
  rule: ViolationRule;
  /** JSON Pointer în UIConfig, ex. "/theme/baseFontPx" sau "/modules/@feed/visible". */
  path: string;
  /** Valoarea primită (după patch); `undefined` dacă lipsește. */
  received: unknown;
  /** Pragul sau forma cerută, dacă există. */
  limit?: number | string;
  /** Scurt, în română, pentru model: ce e greșit și ce poate încerca. */
  message: string;
}

export type GateResult<T> = { ok: true; config: T } | { ok: false; violations: ConfigViolation[] };
