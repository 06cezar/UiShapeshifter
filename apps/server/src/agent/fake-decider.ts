// Agentul fals (AGENT_FAKE=1): pași înregistrați, fără OpenRouter (specs/05, „Reglaje pentru demo”).
// Servește extensia cât timp nu e cheie și e rezerva demo-ului fără rețea. Face același drum ca agentul real în etapa 1:
// „ascunde X” → get_page_snapshot → apply_css → get_page_snapshot (verificare) → finish. Folosește rezultatele reale
// ale uneltelor, deci verificarea chiar se uită dacă elementele au dispărut.
// Cererile pot fi vagi („șterge reclamele”): potrivim pe rădăcini și câteva sinonime, nu pe textul exact (C, pe #27).

import type { PageElement, PageSnapshot, ToolArgs } from "@uishapeshifter/contracts";
import type { Decider, Decision, PreviousStep } from "./run-agent";

export const FAKE_MODEL = "fake";

// „ascunde reclamele”, „șterge Shorts”, „dă jos bara din dreapta”, „nu-mi mai arăta știrile”
const HIDE_REQUEST =
  /(?:ascunde|scoate|elimin[ăa]|[șs]terge|d[ăa] jos|f[ăa] s[ăa] dispar[ăa]|nu-mi (?:mai )?ar[ăa]ta|nu vreau s[ăa] (?:mai )?v[ăa]d)\s+(.+)/i;
/** Câte litere de la începutul unui cuvânt îl reprezintă („reclamele”, „reclama” → „recla”). */
const ROOT_CHARS = 5;
/** Rădăcinile mai scurte (ex. „ai”) se potrivesc doar pe cuvânt întreg, ca „ai” să nu prindă „aici”. */
const MIN_PREFIX_ROOT_CHARS = 3;
/** Cel mult atâtea elemente ascunse într-o cerere, ca o potrivire prea largă să nu golească pagina. */
const MAX_HIDDEN_MATCHES = 10;
const FILLER_WORDS = new Set([
  "butonul",
  "butoanele",
  "bara",
  "barele",
  "sectiunea",
  "sectiunile",
  "toate",
  "tot",
  "toti",
  "alea",
  "astea",
  "cu",
  "de",
  "din",
  "la",
  "si",
  "pe",
  "mi",
  "mai",
  "chestiile",
  "chestia",
  "lucrurile",
  "partea",
  "te",
  "rog",
  "ce",
  "e",
]);
const SYNONYMS: Record<string, string[]> = {
  recla: ["sponsor", "publicit", "promov", "anunt"],
  ai: ["rezumat", "asistent"],
  scurt: ["shorts", "reels"],
  clip: ["shorts", "reels"],
  povest: ["stories"],
};

type Script = (previous: PreviousStep | null) => Decision;

function tool<N extends keyof ToolArgs>(name: N, args: ToolArgs[N], content: string): Decision {
  return { kind: "tool", name, args, content };
}

/** Fără diacritice, majuscule și semne, ca „Știri” să se potrivească cu „stiri”. */
function normalize(text: string): string {
  return text
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N} ]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function words(text: string): string[] {
  return normalize(text).split(" ").filter(Boolean);
}

/** Rădăcinile cererii, cu sinonimele lor: „reclamele” → recla, sponsor, publicit, promov, anunt. */
export function requestRoots(wanted: string): string[] {
  const roots = words(wanted)
    .filter((word) => !FILLER_WORDS.has(word))
    .map((word) => word.slice(0, ROOT_CHARS));
  return [...new Set(roots.flatMap((root) => [root, ...(SYNONYMS[root] ?? [])]))];
}

function matches(label: string, roots: string[]): boolean {
  return words(label).some((word) =>
    roots.some((root) => (root.length >= MIN_PREFIX_ROOT_CHARS ? word.startsWith(root) : word === root)),
  );
}

function snapshotFrom(previous: PreviousStep | null): PageSnapshot | null {
  if (previous?.name !== "get_page_snapshot" || !previous.result.ok) return null;
  const snapshot = previous.result.data as PageSnapshot | null;
  return snapshot && Array.isArray(snapshot.elements) ? snapshot : null;
}

/** Toate elementele vizibile care se potrivesc cu cererea, după rădăcini și sinonime (cel mult MAX_HIDDEN_MATCHES). */
export function findElements(snapshot: PageSnapshot | null, wanted: string): PageElement[] {
  const roots = requestRoots(wanted);
  if (roots.length === 0 || !snapshot) return [];
  return snapshot.elements
    .filter((element) => element.visible && matches(element.label, roots))
    .slice(0, MAX_HIDDEN_MATCHES);
}

function labels(elements: PageElement[]): string {
  return elements.map((element) => `„${element.label}”`).join(", ");
}

function hideScript(goal: string, wanted: string): Script[] {
  let found: PageElement[] = [];
  return [
    () =>
      tool(
        "get_page_snapshot",
        {},
        `Observ: Mi se cere: „${goal}”. Fac: Mă uit la pagină. Pentru că: Trebuie să găsesc „${wanted}” înainte să schimb ceva.`,
      ),
    (previous) => {
      found = findElements(snapshotFrom(previous), wanted);
      if (found.length === 0) {
        return tool(
          "say",
          { message: `Nu găsesc „${wanted}” pe pagina asta.`, mascot: "confused" },
          `Observ: Niciun element vizibil nu se potrivește cu „${wanted}”. Fac: Îi spun omului. Pentru că: Nu inventez.`,
        );
      }
      const selectors = found.map((element) => element.selector).join(", ");
      return tool(
        "apply_css",
        { css: `${selectors} { display: none !important; }`, reason: `Ascund ${labels(found)}, cerut de om.` },
        `Observ: Se potrivesc ${labels(found)}. Fac: Le ascund cu CSS. Pentru că: Omul nu vrea să le vadă.`,
      );
    },
    () =>
      found.length > 0
        ? tool(
            "get_page_snapshot",
            {},
            `Observ: Am aplicat CSS-ul. Fac: Mă uit din nou la pagină. Pentru că: Verific că ${labels(found)} au dispărut.`,
          )
        : tool(
            "finish",
            { summary: `Nu am găsit „${wanted}” pe pagină, așa că n-am schimbat nimic.`, success: false },
            "Observ: N-am găsit elementul. Fac: Închei. Pentru că: Nu am ce ascunde.",
          ),
    (previous) => {
      const after = snapshotFrom(previous)?.elements ?? [];
      const stillVisible = found.filter((element) => after.some((e) => e.id === element.id && e.visible));
      return tool(
        "finish",
        stillVisible.length === 0
          ? { summary: `Am ascuns ${labels(found)}. Rămân ascunse și data viitoare.`, success: true }
          : {
              summary: `Am încercat să ascund ${labels(found)}, dar ${labels(stillVisible)} încă se vede.`,
              success: false,
            },
        stillVisible.length === 0
          ? "Observ: Elementele nu se mai văd. Fac: Închei. Pentru că: Cererea e îndeplinită."
          : "Observ: Unele elemente se văd încă. Fac: Închei și spun. Pentru că: În modul de probă nu încerc altceva.",
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
