// Modelul scrie înainte de fiecare tool call un rând „Observ: …. Fac: …. Pentru că: …” (specs/05).
// Aici îl despărțim în cele trei câmpuri ale pasului din jurnal.

export interface Reasoning {
  observation: string;
  decision: string;
  reason: string;
}

const MARKERS = [
  { field: "observation", pattern: /observ\s*:/i },
  { field: "decision", pattern: /fac\s*:/i },
  { field: "reason", pattern: /pentru\s+c[ăa]\s*:/i },
] as const;

function clean(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

export function parseReasoning(content: string | null | undefined): Reasoning {
  const text = content ?? "";
  const found = MARKERS.map(({ field, pattern }) => {
    const match = pattern.exec(text);
    return match ? { field, start: match.index, end: match.index + match[0].length } : null;
  })
    .filter((marker) => marker !== null)
    .sort((a, b) => a.start - b.start);

  const reasoning: Reasoning = { observation: "", decision: "", reason: "" };
  if (found.length === 0) {
    // modelul n-a respectat formatul: păstrăm tot textul ca decizie, să nu se piardă din jurnal
    reasoning.decision = clean(text);
    return reasoning;
  }
  found.forEach((marker, i) => {
    const next = found[i + 1];
    reasoning[marker.field] = clean(text.slice(marker.end, next ? next.start : undefined));
  });
  return reasoning;
}

const TOOL_VERBS: Partial<Record<string, string>> = {
  get_page_snapshot: "Mă uit la pagină",
  apply_css: "Schimb aspectul paginii",
  apply_ops: "Schimb structura paginii",
  point_at: "Arăt pe pagină",
  wait_for_user_click: "Aștept să apeși",
  ask_user: "Te întreb ceva",
  propose_changes: "Îți arăt schimbările",
  audit_ui: "Verific accesibilitatea",
  say: "Îți spun ceva",
  get_profile: "Citesc ce știu despre tine",
  update_profile: "Notez ce am învățat",
  finish: "Închei",
};

/** Când modelul sare peste rândul „Observ / Fac / Pentru că”, panoul primește măcar ce face pasul. */
export function withToolFallback(reasoning: Reasoning, tool: string, args: unknown): Reasoning {
  if (reasoning.decision) return reasoning;
  // regionId („r.main”) nu e pentru om: panoul arăta „Mă uit la pagină: r.main”
  const { reason, message, summary, regionId } = (args ?? {}) as Record<string, unknown>;
  const detail = [reason, message, summary].find((value) => typeof value === "string");
  const verb =
    tool === "get_page_snapshot" && typeof regionId === "string"
      ? "Mă uit mai atent la o parte a paginii"
      : (TOOL_VERBS[tool] ?? "Lucrez la pagină");
  return { ...reasoning, decision: detail ? `${verb}: ${clean(detail as string)}` : `${verb}.` };
}
