// Agentul fals (AGENT_FAKE=1): pași înregistrați, fără OpenRouter (specs/05, „Reglaje pentru demo”).
// Servește extensia cât timp nu e cheie și e rezerva demo-ului fără rețea. Face același drum ca agentul real în etapa 1:
// „ascunde X” → get_page_snapshot → apply_css → get_page_snapshot (verificare) → finish. Folosește rezultatele reale
// ale uneltelor, deci verificarea chiar se uită dacă elementul a dispărut.

import type { PageElement, PageSnapshot, ToolArgs } from "@uishapeshifter/contracts";
import type { Decider, Decision, PreviousStep } from "./run-agent";

export const FAKE_MODEL = "fake";

// „ascunde reclamele”, „scoate Shorts”, „nu vreau să văd bara din dreapta”
const HIDE_REQUEST = /(?:ascunde|scoate|elimin[ăa]|nu vreau s[ăa] (?:mai )?v[ăa]d)\s+(.+)/i;
const MIN_TARGET_CHARS = 2;

type Script = (previous: PreviousStep | null) => Decision;

function tool<N extends keyof ToolArgs>(name: N, args: ToolArgs[N], content: string): Decision {
  return { kind: "tool", name, args, content };
}

/** Fără diacritice și majuscule, ca „Știri” să se potrivească cu „stiri”. */
function normalize(text: string): string {
  return text
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N} ]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function snapshotFrom(previous: PreviousStep | null): PageSnapshot | null {
  if (previous?.name !== "get_page_snapshot" || !previous.result.ok) return null;
  const snapshot = previous.result.data as PageSnapshot | null;
  return snapshot && Array.isArray(snapshot.elements) ? snapshot : null;
}

/** Primul element vizibil al cărui text conține ce a cerut omul (sau invers, pentru etichete scurte). */
export function findElement(snapshot: PageSnapshot | null, wanted: string): PageElement | undefined {
  const target = normalize(wanted);
  if (target.length < MIN_TARGET_CHARS) return undefined;
  return snapshot?.elements.find((element) => {
    const label = normalize(element.label);
    return element.visible && label.length >= MIN_TARGET_CHARS && (label.includes(target) || target.includes(label));
  });
}

function hideScript(goal: string, wanted: string): Script[] {
  let found: PageElement | undefined;
  return [
    () =>
      tool(
        "get_page_snapshot",
        {},
        `Observ: Mi se cere: „${goal}”. Fac: Mă uit la pagină. Pentru că: Trebuie să găsesc „${wanted}” înainte să schimb ceva.`,
      ),
    (previous) => {
      found = findElement(snapshotFrom(previous), wanted);
      if (!found) {
        return tool(
          "say",
          { message: `Nu găsesc „${wanted}” pe pagina asta.`, mascot: "confused" },
          `Observ: Niciun element vizibil nu se potrivește cu „${wanted}”. Fac: Îi spun omului. Pentru că: Nu ghicesc.`,
        );
      }
      return tool(
        "apply_css",
        { css: `${found.selector} { display: none !important; }`, reason: `Ascund „${found.label}”, cerut de om.` },
        `Observ: „${found.label}” e elementul ${found.id}. Fac: Îl ascund cu CSS. Pentru că: Omul nu vrea să-l vadă.`,
      );
    },
    () =>
      found
        ? tool(
            "get_page_snapshot",
            {},
            `Observ: Am aplicat CSS-ul. Fac: Mă uit din nou la pagină. Pentru că: Verific că „${found.label}” a dispărut.`,
          )
        : tool(
            "finish",
            { summary: `Nu am găsit „${wanted}” pe pagină, așa că n-am schimbat nimic.`, success: false },
            "Observ: N-am găsit elementul. Fac: Închei. Pentru că: Nu am ce ascunde.",
          ),
    (previous) => {
      const after = snapshotFrom(previous)?.elements.find((element) => element.id === found?.id);
      const hidden = !after || !after.visible;
      return tool(
        "finish",
        hidden
          ? { summary: `Am ascuns „${found?.label}”. Rămâne ascuns și data viitoare.`, success: true }
          : { summary: `Am încercat să ascund „${found?.label}”, dar încă se vede.`, success: false },
        hidden
          ? "Observ: Elementul nu se mai vede. Fac: Închei. Pentru că: Cererea e îndeplinită."
          : "Observ: Elementul se vede încă. Fac: Închei și spun. Pentru că: În modul de probă nu încerc altceva.",
      );
    },
  ];
}

function defaultScript(goal: string): Script[] {
  return [
    () =>
      tool(
        "get_page_snapshot",
        {},
        `Observ: Mi se cere: „${goal}”. Fac: Mă uit la pagină. Pentru că: Observ înainte să schimb ceva.`,
      ),
    () =>
      tool(
        "say",
        { message: "Sunt în modul de probă. Încearcă: „ascunde <ceva de pe pagină>”.", mascot: "speaking" },
        "Observ: În modul de probă știu doar să ascund. Fac: Îi spun omului ce poate încerca. Pentru că: Să nu rămână fără răspuns.",
      ),
    () =>
      tool(
        "finish",
        { summary: "Sunt în modul de probă și știu doar să ascund elemente.", success: false },
        "Observ: Nu am un plan pentru cererea asta. Fac: Închei. Pentru că: Nu ghicesc.",
      ),
  ];
}

export function createFakeDecider(goal: string, stepDelayMs = 0): Decider {
  const wanted = HIDE_REQUEST.exec(goal)?.[1]
    ?.replace(/[.!?]+$/, "")
    .trim();
  const script = wanted ? hideScript(goal, wanted) : defaultScript(goal);
  let next = 0;
  return {
    model: FAKE_MODEL,
    async decide(previous) {
      // o mică pauză, ca în panou pașii să se vadă venind unul câte unul, ca la agentul real
      if (stepDelayMs > 0) await new Promise((resolve) => setTimeout(resolve, stepDelayMs));
      const step = script[Math.min(next, script.length - 1)];
      next += 1;
      return step(previous);
    },
  };
}
