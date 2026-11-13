// Agentul fals (AGENT_FAKE=1): pași înregistrați, fără OpenRouter (specs/05, „Reglaje pentru demo”).
// Servește frontend-ul cât timp nu există bucla reală și e rezerva demo-ului fără rețea.
// Folosește rezultatele reale ale uneltelor (snapshot-ul, revizia), ca drumul prin protocol să fie cel adevărat.

import { HARD_LIMITS, type JsonPatchOp, type ToolArgs, type UISnapshot } from "@uishapeshifter/contracts";
import type { Decider, Decision, PreviousStep } from "./run-agent";

export const FAKE_MODEL = "fake";

const FONT_STEP_PX = 2;
const FALLBACK_POINT_TARGET = "nav.messages";
const BIGGER_TEXT_GOAL = /mare|mări|mare[sș]te|citesc greu|v[ăa]d greu/i;

type Step = (previous: PreviousStep | null) => Decision;

function tool<N extends keyof ToolArgs>(name: N, args: ToolArgs[N], content: string): Decision {
  return { kind: "tool", name, args, content };
}

function snapshotFrom(previous: PreviousStep | null): UISnapshot | null {
  if (previous?.name !== "get_ui_snapshot" || !previous.result.ok) return null;
  const snapshot = previous.result.data as UISnapshot | null;
  return snapshot && Array.isArray(snapshot.elements) ? snapshot : null;
}

/** Fontul de bază de acum, ghicit din snapshot: cel mai mic font de pe ecran (sau minimul). */
function currentBaseFont(snapshot: UISnapshot | null): number {
  const fonts = (snapshot?.elements ?? [])
    .map((element) => element.fontPx)
    .filter((font): font is number => typeof font === "number" && font > 0);
  return fonts.length > 0 ? Math.round(Math.min(...fonts)) : HARD_LIMITS.minFontPx;
}

function biggerTextScript(goal: string): Step[] {
  let snapshot: UISnapshot | null = null;
  return [
    () =>
      tool(
        "get_ui_snapshot",
        {},
        `Observ: Mi se cere: „${goal}”. Fac: Mă uit întâi la ecran. Pentru că: Trebuie să văd cât de mare e textul acum.`,
      ),
    (previous) => {
      snapshot = snapshotFrom(previous);
      const from = currentBaseFont(snapshot);
      const to = Math.min(from + FONT_STEP_PX, HARD_LIMITS.maxFontPx);
      const ops: JsonPatchOp[] = [{ op: "replace", path: "/theme/baseFontPx", value: to }];
      return tool(
        "patch_config",
        { ops, reason: `Text mai mare: ${from}px → ${to}px` },
        `Observ: Textul de bază are ${from}px. Fac: Îl măresc la ${to}px. Pentru că: E o schimbare mică și sigură.`,
      );
    },
    () => {
      const target =
        snapshot?.elements.find((element) => element.visible && element.inViewport && element.interactive)?.id ??
        FALLBACK_POINT_TARGET;
      return tool(
        "point_at",
        { elementId: target, message: "Uite, textul e mai mare acum." },
        `Observ: Schimbarea s-a aplicat. Fac: Arăt cu lăbuța un element. Pentru că: Omul vede pe loc ce s-a schimbat.`,
      );
    },
    () =>
      tool(
        "finish",
        { summary: "Am mărit textul. Dacă vrei, îl fac și mai mare.", success: true },
        "Observ: Textul e mai mare și l-am arătat. Fac: Închei. Pentru că: Scopul e atins.",
      ),
  ];
}

function defaultScript(goal: string): Step[] {
  return [
    () =>
      tool(
        "get_ui_snapshot",
        {},
        `Observ: Mi se cere: „${goal}”. Fac: Mă uit la ecran. Pentru că: Observ înainte să schimb ceva.`,
      ),
    () =>
      tool(
        "say",
        { message: "Sunt în modul de probă. Încearcă: „Fă textul mai mare”.", mascot: "speaking" },
        "Observ: În modul de probă știu doar câteva cereri. Fac: Îi spun omului ce poate încerca. Pentru că: Să nu rămână fără răspuns.",
      ),
    () =>
      tool(
        "finish",
        { summary: "Sunt în modul de probă și știu doar câteva cereri.", success: false },
        "Observ: Nu am un plan înregistrat pentru cererea asta. Fac: Închei. Pentru că: Nu ghicesc.",
      ),
  ];
}

export function createFakeDecider(goal: string, stepDelayMs = 0): Decider {
  const script = BIGGER_TEXT_GOAL.test(goal) ? biggerTextScript(goal) : defaultScript(goal);
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
