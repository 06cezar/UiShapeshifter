// Agentul fals (AGENT_FAKE=1): pași înregistrați, fără OpenRouter (specs/05, „Reglaje pentru demo”).
// Servește extensia cât timp nu e cheie și e rezerva demo-ului fără rețea. Face același drum ca agentul real în etapa 1:
// „ascunde X” → get_page_snapshot → apply_css → get_page_snapshot (verificare) → finish. Folosește rezultatele reale
// ale uneltelor, deci verificarea chiar se uită dacă elementele au dispărut.
// Cererile pot fi vagi („șterge reclamele”): potrivim pe rădăcini și câteva sinonime, nu pe textul exact (C, pe #27).

import type { PageElement, PageSnapshot, SiteToolStage, ToolArgs } from "@uishapeshifter/contracts";
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

/**
 * Din etapa 2, după ce schimbarea s-a verificat în snapshot: audit_ui → propose_changes → finish după decizia omului
 * (specs/05, „Verificare după fiecare schimbare”). În etapa 1, direct finish.
 */
function closingSteps(stage: SiteToolStage, title: () => string, done: () => string): Script[] {
  const finish = (summary: string): Decision =>
    tool("finish", { summary, success: true }, "Observ: Omul a ales. Fac: Închei. Pentru că: Cererea e îndeplinită.");
  if (stage < 2) return [() => finish(done())];
  return [
    () =>
      tool(
        "audit_ui",
        {},
        "Observ: Schimbarea se vede. Fac: Verific accesibilitatea. Pentru că: Nu vreau să fi stricat ceva.",
      ),
    () =>
      tool(
        "propose_changes",
        { title: title(), summary: done(), risk: "low" },
        "Observ: Auditul a trecut. Fac: Îți arăt schimbarea. Pentru că: Tu alegi dacă o păstrezi.",
      ),
    (previous) => {
      const decision =
        previous?.name === "propose_changes" && previous.result.ok
          ? (previous.result.data as { decision?: string } | null)?.decision
          : undefined;
      return finish(decision === "undo" ? "Am lăsat pagina cum era, cum ai ales." : done());
    },
  ];
}

function hideScript(goal: string, wanted: string, stage: SiteToolStage): Script[] {
  let found: PageElement[] = [];
  let failed: Decision | null = null;
  const closing = (): Script[] =>
    closingSteps(
      stage,
      () => "Ascund ce nu vrei",
      () => `Am ascuns ${labels(found)}. Rămân ascunse și data viitoare.`,
    );
  const steps: Script[] = [
    () =>
      tool(
        "get_page_snapshot",
        {},
        `Observ: Mi se cere: „${goal}”. Fac: Mă uit la pagină. Pentru că: Trebuie să găsesc „${wanted}” înainte să schimb ceva.`,
      ),
    (previous) => {
      found = findElements(snapshotFrom(previous), wanted);
      if (found.length === 0) {
        failed = tool(
          "finish",
          { summary: `Nu am găsit „${wanted}” pe pagină, așa că n-am schimbat nimic.`, success: false },
          "Observ: N-am găsit elementul. Fac: Închei. Pentru că: Nu am ce ascunde.",
        );
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
      failed ??
      tool(
        "get_page_snapshot",
        {},
        `Observ: Am aplicat CSS-ul. Fac: Mă uit din nou la pagină. Pentru că: Verific că ${labels(found)} au dispărut.`,
      ),
    (previous) => {
      const after = snapshotFrom(previous)?.elements ?? [];
      const stillVisible = found.filter((element) => after.some((e) => e.id === element.id && e.visible));
      if (stillVisible.length > 0) {
        failed = tool(
          "finish",
          {
            summary: `Am încercat să ascund ${labels(found)}, dar ${labels(stillVisible)} încă se vede.`,
            success: false,
          },
          "Observ: Unele elemente se văd încă. Fac: Închei și spun. Pentru că: În modul de probă nu încerc altceva.",
        );
        return failed;
      }
      return closing()[0](previous);
    },
  ];
  // pașii de după verificare (audit, propunere, finish), fără primul, deja folosit mai sus
  return [...steps, ...closing().slice(1)];
}

// „mută căutarea sus”, „pune meniul jos”
const MOVE_REQUEST =
  /(?:mut[ăa]|pune|du)\s+(.+?)\s+(sus|jos|deasupra|dedesubt|primul|prima|la [îi]nceput|la sf[âa]r[șs]it)\b/i;
const TOWARDS_TOP = /sus|deasupra|primul|prima|[îi]nceput/i;

function moveScript(goal: string, wanted: string, towardsTop: boolean, stage: SiteToolStage): Script[] {
  let found: PageElement | undefined;
  let failed: Decision | null = null;
  const where = towardsTop ? "sus" : "jos";
  const closing = (): Script[] =>
    closingSteps(
      stage,
      () => `Mut „${found?.label ?? wanted}” ${where}`,
      () => `Am mutat „${found?.label ?? wanted}” ${where} în pagină.`,
    );
  return [
    () =>
      tool(
        "get_page_snapshot",
        {},
        `Observ: Mi se cere: „${goal}”. Fac: Mă uit la pagină. Pentru că: Trebuie să găsesc „${wanted}” și unde îl pun.`,
      ),
    (previous) => {
      const snapshot = snapshotFrom(previous);
      found = findElements(snapshot, wanted)[0];
      const regions = [...(snapshot?.regions ?? [])].filter((r) => r.visible).sort((a, b) => a.rect.y - b.rect.y);
      const target = towardsTop ? regions[0] : regions.at(-1);
      if (!found || !target) {
        failed = tool(
          "finish",
          { summary: `Nu am găsit „${wanted}” pe pagină, așa că n-am mutat nimic.`, success: false },
          "Observ: N-am găsit elementul. Fac: Închei. Pentru că: Nu am ce muta.",
        );
        return failed;
      }
      return tool(
        "apply_ops",
        {
          ops: [
            {
              op: "move",
              selector: found.selector,
              to: { selector: target.selector, position: towardsTop ? "prepend" : "append" },
            },
          ],
          reason: `Mut „${found.label}” ${where}, cerut de om.`,
        },
        `Observ: „${found.label}” e elementul ${found.id}. Fac: Îl mut ${where}, în „${target.label}”. Pentru că: Omul îl vrea acolo.`,
      );
    },
    () =>
      failed ??
      tool(
        "get_page_snapshot",
        {},
        `Observ: Am aplicat mutarea. Fac: Mă uit din nou la pagină. Pentru că: Verific că „${found?.label}” e ${where}.`,
      ),
    ...closing(),
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
        "Observ: În modul de probă știu doar câteva cereri. Fac: Îi spun omului ce poate încerca. Pentru că: Să nu rămână fără răspuns.",
      ),
    () =>
      tool(
        "finish",
        { summary: "Sunt în modul de probă: știu să ascund și să mut elemente.", success: false },
        "Observ: Nu am un plan pentru cererea asta. Fac: Închei. Pentru că: Nu ghicesc.",
      ),
  ];
}

function scriptFor(goal: string, stage: SiteToolStage): Script[] {
  const move = stage >= 2 ? MOVE_REQUEST.exec(goal) : null;
  if (move) return moveScript(goal, move[1], TOWARDS_TOP.test(move[2]), stage);
  const wanted = HIDE_REQUEST.exec(goal)?.[1]
    ?.replace(/[.!?]+$/, "")
    .trim();
  return wanted ? hideScript(goal, wanted, stage) : defaultScript(goal);
}

export function createFakeDecider(goal: string, stepDelayMs = 0, stage: SiteToolStage = 1): Decider {
  const script = scriptFor(goal, stage);
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
