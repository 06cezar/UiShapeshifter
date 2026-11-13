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
