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
  get_ui_snapshot: "Mă uit la ecran",
  patch_config: "Schimb interfața",
  apply_template: "Schimb structura ecranului",
  generate_component: "Creez un element nou",
  remove_component: "Șterg un element",
  navigate: "Deschid alt ecran",
  point_at: "Arăt cu lăbuța",
  wait_for_user_click: "Aștept să apeși",
  ask_user: "Te întreb ceva",
  propose_changes: "Îți propun o schimbare",
  audit_ui: "Verific accesibilitatea",
  say: "Îți spun ceva",
  get_profile: "Citesc ce știu despre tine",
  update_profile: "Notez ce am învățat",
  finish: "Închei",
};

/** Când modelul sare peste rândul „Observ / Fac / Pentru că”, panoul primește măcar ce face pasul. */
export function withToolFallback(reasoning: Reasoning, tool: string, args: unknown): Reasoning {
  if (reasoning.decision) return reasoning;
  const { reason, message, elementId, moduleId, summary } = (args ?? {}) as Record<string, unknown>;
  const detail = [reason, message, summary, elementId, moduleId].find((value) => typeof value === "string");
  const verb = TOOL_VERBS[tool] ?? `Folosesc ${tool}`;
  return { ...reasoning, decision: detail ? `${verb}: ${clean(detail as string)}` : `${verb}.` };
}
