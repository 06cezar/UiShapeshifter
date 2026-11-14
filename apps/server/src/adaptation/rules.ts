// Regulile adaptării automate (E3, specs/09): cod fără AI care se uită la semnalele recente ale omului și hotărăște
// dacă e momentul ca mascota să propună ceva. Agentul intră abia după „Da” (sau direct, pentru schimbări mici, când
// omul a acceptat deja de 3 ori la rând).

import type { AdaptationRule, GeneralPreference, PageInfo, UsageSignal } from "@uishapeshifter/contracts";

/** Pragurile din specs/09; cu ADAPT_DEMO=1 sunt mai mici, ca demo-ul să nu aștepte. */
export interface RuleThresholds {
  misclicks: number;
  misclickWindowMs: number;
  zooms: number;
  zoomWindowMs: number;
  minZoomScale: number;
  helpAfterDwellMs: number;
}

export const THRESHOLDS: RuleThresholds = {
  misclicks: 3,
  misclickWindowMs: 2 * 60_000,
  zooms: 2,
  zoomWindowMs: 5 * 60_000,
  minZoomScale: 1.2,
  helpAfterDwellMs: 2 * 60_000,
};

export const DEMO_THRESHOLDS: RuleThresholds = { ...THRESHOLDS, misclicks: 2, zooms: 1 };

/** Un semnal ținut minte, cu pagina pe care s-a întâmplat. */
export interface SeenSignal {
  signal: UsageSignal;
  at: number;
  host?: string;
}

/** Ce a găsit o regulă: ce propune mascota, cu ce scop pornește agentul, pe baza căror semnale. */
export interface Finding {
  rule: AdaptationRule;
  /** Cheia pentru „nu mai propune asta”: regula + elementul / site-ul la care se referă. */
  key: string;
  text: string;
  goal: string;
  risk: "low" | "high";
  host?: string;
  /** general-preferences: preferințele propuse aici, ca la „Da” să notăm site-ul în appliedOn fără model. */
  preferenceIds?: string[];
  evidence: UsageSignal[];
}

const within = (seen: SeenSignal[], now: number, ms: number) => seen.filter((s) => now - s.at <= ms);

/** small-targets: ≥ 3 ratări în 2 min lângă același element. */
function smallTargets(seen: SeenSignal[], now: number, t: RuleThresholds): Finding[] {
  const byElement = new Map<string, SeenSignal[]>();
  for (const s of within(seen, now, t.misclickWindowMs)) {
    if (s.signal.kind !== "misclick" || !s.signal.nearestElementId) continue;
    const key = `${s.host ?? ""}|${s.signal.nearestElementId}`;
    byElement.set(key, [...(byElement.get(key) ?? []), s]);
  }
  const findings: Finding[] = [];
  for (const [key, group] of byElement) {
    if (group.length < t.misclicks) continue;
    const first = group[0]!;
    const elementId = first.signal.kind === "misclick" ? first.signal.nearestElementId : undefined;
    findings.push({
      rule: "small-targets",
      key: `small-targets|${key}`,
      text: "Butoanele par greu de apăsat. Le măresc?",
      goal:
        `Omul ratează des elementul ${elementId}` +
        (first.host ? ` de pe ${first.host}` : "") +
        ` (${group.length} click-uri pe lângă el în ultimele minute): mărește țintele din zona lui, în limitele de ` +
        "accesibilitate, verifică cu audit_ui și spune pe scurt ce ai schimbat.",
      risk: "low",
      host: first.host,
      evidence: group.map((s) => s.signal),
    });
  }
  return findings;
}

/** font-too-small: ≥ 2 zoom-uri cu scara > 1.2 în 5 min. */
function fontTooSmall(seen: SeenSignal[], now: number, t: RuleThresholds): Finding[] {
  const zooms = within(seen, now, t.zoomWindowMs).filter(
    (s) => s.signal.kind === "zoom" && s.signal.scale > t.minZoomScale,
  );
  if (zooms.length < t.zooms) return [];
  const host = zooms.at(-1)!.host;
  return [
    {
      rule: "font-too-small",
      key: `font-too-small|${host ?? ""}`,
      text: "Pare că textul e mic și măriți pagina. Îl măresc eu?",
      goal:
        "Omul își face zoom pe pagină" +
        (host ? ` (${host})` : "") +
        ": mărește textul pe site-ul acesta cu apply_css, verifică cu audit_ui și spune pe scurt ce ai schimbat.",
      risk: "low",
      host,
      evidence: zooms.map((s) => s.signal),
    },
  ];
}

/** lost-in-navigation: o buclă înainte-înapoi, sau stat pe loc urmat de o cerere de ajutor. */
function lostInNavigation(seen: SeenSignal[], now: number, t: RuleThresholds): Finding[] {
  const recent = within(seen, now, t.helpAfterDwellMs);
  const loop = recent.find((s) => s.signal.kind === "back_loop");
  const dwell = recent.find((s) => s.signal.kind === "dwell");
  const help = recent.find((s) => s.signal.kind === "help_request");
  const cause = loop ?? (dwell && help ? dwell : undefined);
  if (!cause) return [];
  const where = cause.signal.kind === "back_loop" || cause.signal.kind === "dwell" ? cause.signal.moduleId : "";
  return [
    {
      rule: "lost-in-navigation",
      key: `lost-in-navigation|${cause.host ?? ""}|${where}`,
      text: "Pari să cauți ceva. Vrei să simplific pagina sau să-ți arăt drumul?",
      goal:
        `Omul pare pierdut pe ${cause.host ?? "pagină"} (${where}): întreabă-l scurt ce caută (ask_user), apoi ` +
        "simplifică zona sau arată-i drumul cu point_at.",
      risk: "high",
      host: cause.host,
      evidence: [cause.signal, ...(help ? [help.signal] : [])],
    },
  ];
}

export function evaluateRules(seen: SeenSignal[], now: number, thresholds: RuleThresholds = THRESHOLDS): Finding[] {
  return [
    ...smallTargets(seen, now, thresholds),
    ...fontTooSmall(seen, now, thresholds),
    ...lostInNavigation(seen, now, thresholds),
  ];
}

/**
 * general-preferences: prima dată pe un site, omul are preferințe generale neaplicate acolo (specs/08, specs/09).
 * O singură propunere pe site, cu toate preferințele care lipsesc.
 */
export function generalPreferencesFinding(page: PageInfo, preferences: GeneralPreference[]): Finding | null {
  // Cele cu css (aspect „peste tot”) le pune extensia singură pe orice site, fără AI: n-are rost să întrebăm.
  const missing = preferences.filter((p) => !p.css && !p.appliedOn.includes(page.host));
  if (missing.length === 0) return null;
  const list = missing.map((p) => p.text).join("; ");
  return {
    rule: "general-preferences",
    key: `general-preferences|${page.host}`,
    text: `Pe ${page.host} pot aplica ce vrei peste tot: ${list}. Le aplic?`,
    goal:
      `Aplică pe ${page.host} preferințele generale ale omului: ${list}. Caută în snapshot elementele care li se ` +
      "potrivesc, ascunde-le cu apply_css și verifică. Site-ul e deja notat în appliedOn.",
    risk: "high",
    host: page.host,
    preferenceIds: missing.map((p) => p.id),
    evidence: [],
  };
}
