// Rezumatul profilului pentru promptul agentului: determinist, în română, cel mult ~150 de cuvinte (specs/08).
// Nu trimitem tot JSON-ul: modelul primește doar ce îl ajută să decidă, în ordinea importanței.

import type { Persona, UserProfile } from "@uishapeshifter/contracts";

export const MAX_SUMMARY_WORDS = 150;
/** Câte fapte intră în rezumat (cele mai sigure). */
const TOP_FACTS = 5;
/** Câte elemente din fiecare listă (scopuri, sarcini, contacte, dificultăți). */
const MAX_LIST_ITEMS = 3;

const AGE_LABEL: Record<NonNullable<Persona["ageRange"]>, string> = {
  "18-34": "18-34 de ani",
  "35-59": "35-59 de ani",
  "60-74": "60-74 de ani",
  "75+": "peste 75 de ani",
};
const TECH_LABEL: Record<Persona["techComfort"], string> = { low: "scăzut", medium: "mediu", high: "ridicat" };
const NAV_LABEL = { left: "în stânga", top: "sus", bottom: "jos" } as const;

function countWords(text: string): number {
  return text.split(/\s+/).filter(Boolean).length;
}

function list(items: string[]): string {
  return items.slice(0, MAX_LIST_ITEMS).join("; ");
}

/** Propozițiile, în ordinea importanței. Cele de la coadă cad primele dacă nu încap. */
function summaryParts(profile: UserProfile): string[] {
  const { needs, preferences: prefs, persona, trust } = profile;
  const parts: string[] = [];

  const who = [profile.displayName];
  if (persona.ageRange) who.push(AGE_LABEL[persona.ageRange]);
  who.push(`confort cu tehnologia ${TECH_LABEL[persona.techComfort]}`);
  parts.push(`Utilizator: ${who.join(", ")}.`);

  if (!profile.onboarding.completed) {
    parts.push(profile.onboarding.skipped ? "A sărit testul inițial." : "Nu a făcut încă testul inițial.");
  }

  const needList = [`font minim ${needs.minFontPx}px`, `ținte de cel puțin ${needs.minTargetPx}px`];
  if (needs.contrast === "high") needList.push("contrast ridicat");
  if (needs.reducedMotion) needList.push("fără animații");
  if (needs.prefersVoice) needList.push("preferă vocea");
  parts.push(`Nevoi (obligatorii): ${needList.join(", ")}.`);

  const prefList: string[] = [];
  if (prefs.navPosition) prefList.push(`meniul ${NAV_LABEL[prefs.navPosition]}`);
  if (prefs.template) prefList.push(`șablonul ${prefs.template}`);
  if (prefs.familiarLayouts.length) prefList.push(`structuri familiare: ${prefs.familiarLayouts.join(", ")}`);
  if (prefs.pinnedModules.length) prefList.push(`fixate: ${prefs.pinnedModules.join(", ")}`);
  if (prefs.hiddenModules.length) prefList.push(`ascunse: ${prefs.hiddenModules.join(", ")}`);
  if (prefList.length) parts.push(`Preferințe: ${prefList.join("; ")}.`);

  if (persona.goals.length) parts.push(`Scopuri: ${list(persona.goals)}.`);
  if (persona.frequentTasks.length) parts.push(`Face des: ${list(persona.frequentTasks)}.`);
  if (persona.keyContacts.length) parts.push(`Contacte importante: ${list(persona.keyContacts)}.`);
  if (persona.painPoints.length) parts.push(`Dificultăți: ${list(persona.painPoints)}.`);

  const facts = [...profile.facts].sort((a, b) => b.confidence - a.confidence).slice(0, TOP_FACTS);
  for (const fact of facts) {
    const sentence = /[.!?]$/.test(fact.statement) ? fact.statement : `${fact.statement}.`;
    parts.push(`Știm (${Math.round(fact.confidence * 100)}%): ${sentence}`);
  }

  const auto = trust.autoApplyLowRisk ? "da" : "nu";
  parts.push(`Încredere: ${trust.accepted} propuneri păstrate, ${trust.undone} anulate; aplicare automată: ${auto}.`);
  return parts;
}

export function profileSummary(profile: UserProfile): string {
  const kept: string[] = [];
  let words = 0;
  for (const part of summaryParts(profile)) {
    const partWords = countWords(part);
    if (words + partWords > MAX_SUMMARY_WORDS) continue;
    kept.push(part);
    words += partWords;
  }
  return kept.join(" ");
}
