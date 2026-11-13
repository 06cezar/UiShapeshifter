// Testul inițial (specs/10): pașii pe rând, „Omite” pe fiecare ecran, rezumat, trimis la server.
// După PUT /onboarding, serverul pornește rularea agentului cu origin "onboarding" (A1 + E1).

import { useEffect, useRef, useState } from "react";
import type { CSSProperties, ReactNode, SyntheticEvent } from "react";
import { DEFAULT_CONFIG } from "@uishapeshifter/contracts";
import type { LayoutTemplate, OnboardingResult, UserProfile } from "@uishapeshifter/contracts";
import { themeToCssVars } from "../ui/theme-css";
import { submitOnboarding } from "./api";
import { LAYOUT_NAMES, LayoutSketch } from "./LayoutSketch";
import {
  buildOnboardingResult,
  FONT_CHOICES_PX,
  LAYOUT_CHOICES,
  NAV_CHOICES,
  NAV_NAMES,
  skippedResult,
  summaryText,
  TASK_CHOICES,
  type OnboardingAnswers,
  type TaskChoice,
  type TouchTrial,
} from "./result";
import { TouchTest } from "./TouchTest";
import "./onboarding.css";

/** Testul pornește deja mare (specs/10): font de 20px și ținte de 56px, oricare ar fi tema. */
const ONBOARDING_FONT_PX = 20;
const ONBOARDING_TARGET_PX = 56;
/**
 * După ce apare un pas nou, click-urile din conținut sunt ignorate atâta timp: al doilea click al unui dublu-click
 * ar răspunde altfel la o întrebare pe care omul n-a văzut-o.
 */
export const STEP_INPUT_GUARD_MS = 400;
/** Ce vede omul când nu se poate salva; detaliul tehnic merge în consolă. */
const SAVE_ERROR_TEXT = "Nu am putut salva răspunsurile. Încearcă din nou peste câteva clipe.";
/**
 * Testul rulează înaintea aplicației (OnboardingGate), deci înainte ca store-ul să scrie tema pe :root.
 * Își pune singur tema implicită, ca variabilele CSS să existe oricând e montat.
 */
const THEME_VARS = themeToCssVars(DEFAULT_CONFIG.theme, DEFAULT_CONFIG.minTargetPx);

const FONT_SAMPLE = "Ana ți-a trimis o poză cu pisica.";
const CONTRAST_SAMPLE = "Ion: Vin duminică la masă.";

type StepId = "welcome" | "font" | "contrast" | "touch" | "tasks" | "layout" | "nav" | "voice" | "summary";

const STEPS: { id: StepId; mascot: string }[] = [
  { id: "welcome", mascot: "Bună! Eu sunt vulpița. Te ajut să-ți faci aplicația pe gustul tău." },
  { id: "font", mascot: "Pe care o citești ușor, fără să te apleci?" },
  { id: "contrast", mascot: "Care se vede mai bine?" },
  { id: "touch", mascot: "Apasă pe cercul care apare. Fără grabă." },
  { id: "tasks", mascot: "Ce folosești cel mai des? Poți alege mai multe." },
  { id: "layout", mascot: "Cu care dintre acestea ești obișnuit?" },
  { id: "nav", mascot: "Unde vrei meniul?" },
  { id: "voice", mascot: "Vrei să-mi vorbești în loc să scrii?" },
  { id: "summary", mascot: "" }, // textul vine din răspunsuri (summaryText)
];

export interface OnboardingProps {
  userId: string;
  /** Profilul salvat; `null` dacă serverul nu răspunde și omul a ales să intre fără să salveze. */
  onDone: (profile: UserProfile | null) => void;
  fetchFn?: typeof fetch;
  /** Pentru teste: pauza după schimbarea pasului (implicit STEP_INPUT_GUARD_MS). */
  inputGuardMs?: number;
}

type SaveState =
  { status: "idle" } | { status: "saving" } | { status: "error"; message: string; result: OnboardingResult };

export function Onboarding({ userId, onDone, fetchFn, inputGuardMs = STEP_INPUT_GUARD_MS }: OnboardingProps) {
  const [stepIndex, setStepIndex] = useState(0);
  const [answers, setAnswers] = useState<OnboardingAnswers>({});
  const [save, setSave] = useState<SaveState>({ status: "idle" });
  const headingRef = useRef<HTMLHeadingElement>(null);
  const stepShownAt = useRef(performance.now());

  const step = STEPS[stepIndex];
  const result = buildOnboardingResult(answers);
  const mascotLine = step.id === "summary" ? summaryText(result) : step.mascot;

  // La fiecare pas nou: focusul pe titlu (cititorul de ecran îl anunță, tastatura pornește de sus), pauza pentru
  // click-uri pornește din nou, iar o eroare de salvare de la pasul vechi dispare, ca să nu retrimită alt rezultat.
  useEffect(() => {
    headingRef.current?.focus();
    stepShownAt.current = performance.now();
    setSave((current) => (current.status === "error" ? { status: "idle" } : current));
  }, [stepIndex]);

  function ignoreEarlyInput(event: SyntheticEvent) {
    if (performance.now() - stepShownAt.current >= inputGuardMs) return;
    event.preventDefault();
    event.stopPropagation();
  }

  function next(update: Partial<OnboardingAnswers> = {}) {
    setAnswers((prev) => ({ ...prev, ...update }));
    setStepIndex((i) => Math.min(i + 1, STEPS.length - 1));
  }

  async function send(toSend: OnboardingResult) {
    setSave({ status: "saving" });
    try {
      onDone(await submitOnboarding(userId, toSend, fetchFn));
    } catch (error) {
      console.error("onboarding: rezultatul nu s-a salvat", error);
      setSave({ status: "error", message: SAVE_ERROR_TEXT, result: toSend });
    }
  }

  const style = {
    ...THEME_VARS,
    "--onboarding-font": `${ONBOARDING_FONT_PX}px`,
    "--onboarding-target": `${ONBOARDING_TARGET_PX}px`,
  } as CSSProperties;

  return (
    <main className="onboarding" style={style} aria-labelledby="onboarding-title">
      <header className="onboarding__header">
        <span className="onboarding__progress">
          Pasul {stepIndex + 1} din {STEPS.length}
        </span>
        <button
          type="button"
          className="onboarding__skip"
          onClick={() => send(skippedResult())}
          disabled={save.status === "saving"}
          data-agent-id="onboarding.skip"
        >
          Omite
        </button>
      </header>

      <p className="onboarding__mascot" aria-live="polite">
        {mascotLine}
      </p>

      <h1 id="onboarding-title" className="onboarding__title" ref={headingRef} tabIndex={-1}>
        {TITLES[step.id]}
      </h1>

      <section className="onboarding__body" onClickCapture={ignoreEarlyInput} onPointerDownCapture={ignoreEarlyInput}>
        {renderStep(step.id)}
      </section>

      {save.status === "error" && (
        <div className="onboarding__error" role="alert">
          <p>{save.message}</p>
          <div className="onboarding__row">
            <button type="button" className="onboarding__primary" onClick={() => send(save.result)}>
              Încearcă din nou
            </button>
            <button type="button" className="onboarding__secondary" onClick={() => onDone(null)}>
              Intră fără să salvez
            </button>
          </div>
        </div>
      )}

      {stepIndex > 0 && step.id !== "touch" && (
        <footer className="onboarding__footer">
          <button
            type="button"
            className="onboarding__secondary"
            onClick={() => setStepIndex(stepIndex - 1)}
            data-agent-id="onboarding.back"
          >
            Înapoi
          </button>
        </footer>
      )}
    </main>
  );

  function renderStep(id: StepId): ReactNode {
    switch (id) {
      case "welcome":
        return (
          <PrimaryButton id="onboarding.next" onClick={() => next()}>
            Începem
          </PrimaryButton>
        );
      case "font":
        return (
          <div className="onboarding__list">
            {FONT_CHOICES_PX.map((px) => (
              <Choice
                key={px}
                id={`onboarding.font.${px}`}
                selected={answers.fontPx === px}
                label={`Textul de ${px} pixeli`}
                onClick={() => next({ fontPx: px })}
              >
                <span style={{ fontSize: px }}>{FONT_SAMPLE}</span>
              </Choice>
            ))}
          </div>
        );
      case "contrast":
        return (
          <div className="onboarding__grid">
            <Choice
              id="onboarding.contrast.normal"
              className="onboarding__card onboarding__card--normal"
              selected={answers.contrast === "normal"}
              label="Contrast obișnuit"
              onClick={() => next({ contrast: "normal" })}
            >
              {CONTRAST_SAMPLE}
            </Choice>
            <Choice
              id="onboarding.contrast.high"
              className="onboarding__card onboarding__card--high"
              selected={answers.contrast === "high"}
              label="Contrast mare"
              onClick={() => next({ contrast: "high" })}
            >
              {CONTRAST_SAMPLE}
            </Choice>
          </div>
        );
      case "touch":
        return <TouchTest onDone={(touch: TouchTrial[]) => next({ touch })} />;
      case "tasks":
        return (
          <>
            <div className="onboarding__grid">
              {(Object.keys(TASK_CHOICES) as TaskChoice[]).map((task) => {
                const chosen = answers.tasks?.includes(task) ?? false;
                return (
                  <button
                    key={task}
                    type="button"
                    className="onboarding__card"
                    aria-pressed={chosen}
                    onClick={() => setAnswers((prev) => ({ ...prev, tasks: toggle(prev.tasks ?? [], task) }))}
                    data-agent-id={`onboarding.task.${task}`}
                  >
                    {TASK_CHOICES[task].label}
                  </button>
                );
              })}
            </div>
            <PrimaryButton id="onboarding.next" onClick={() => next()}>
              Mai departe
            </PrimaryButton>
          </>
        );
      case "layout":
        return (
          <div className="onboarding__grid">
            {LAYOUT_CHOICES.map((template: LayoutTemplate) => (
              <Choice
                key={template}
                id={`onboarding.layout.${template}`}
                className="onboarding__card"
                selected={answers.layout === template}
                onClick={() => next({ layout: template })}
              >
                <LayoutSketch template={template} />
                {LAYOUT_NAMES[template]}
              </Choice>
            ))}
          </div>
        );
      case "nav":
        return (
          <div className="onboarding__row">
            {NAV_CHOICES.map((position) => (
              <Choice
                key={position}
                id={`onboarding.nav.${position}`}
                selected={answers.navPosition === position}
                onClick={() => next({ navPosition: position })}
              >
                {capitalize(NAV_NAMES[position])}
              </Choice>
            ))}
          </div>
        );
      case "voice":
        return (
          <div className="onboarding__row">
            <Choice
              id="onboarding.voice.yes"
              selected={answers.prefersVoice === true}
              onClick={() => next({ prefersVoice: true })}
            >
              Da, vreau să vorbesc
            </Choice>
            <Choice
              id="onboarding.voice.no"
              selected={answers.prefersVoice === false}
              onClick={() => next({ prefersVoice: false })}
            >
              Nu, prefer să scriu
            </Choice>
          </div>
        );
      case "summary":
        return (
          <PrimaryButton id="onboarding.finish" onClick={() => send(result)} disabled={save.status === "saving"}>
            {save.status === "saving" ? "Salvez…" : "Gata, intru în aplicație"}
          </PrimaryButton>
        );
    }
  }
}

const TITLES: Record<StepId, string> = {
  welcome: "Bun venit",
  font: "Ce mărime de text îți place?",
  contrast: "Ce se vede mai bine?",
  touch: "Cât de mari să fie butoanele?",
  tasks: "Ce folosești des?",
  layout: "Cu ce ești obișnuit?",
  nav: "Unde vrei meniul?",
  voice: "Vrei să vorbești cu mine?",
  summary: "Aplicația ta e gata",
};

function PrimaryButton(props: { id: string; onClick: () => void; disabled?: boolean; children: ReactNode }) {
  return (
    <button
      type="button"
      className="onboarding__primary"
      onClick={props.onClick}
      disabled={props.disabled}
      data-agent-id={props.id}
    >
      {props.children}
    </button>
  );
}

/** O opțiune de ales; `label` înlocuiește textul vizibil pentru cititorul de ecran când mostra nu spune ce e. */
function Choice(props: {
  id: string;
  selected: boolean;
  onClick: () => void;
  label?: string;
  className?: string;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      className={props.className ?? "onboarding__choice"}
      aria-pressed={props.selected}
      aria-label={props.label}
      onClick={props.onClick}
      data-agent-id={props.id}
    >
      {props.children}
    </button>
  );
}

function capitalize(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

function toggle<T>(items: T[], item: T): T[] {
  return items.includes(item) ? items.filter((x) => x !== item) : [...items, item];
}
