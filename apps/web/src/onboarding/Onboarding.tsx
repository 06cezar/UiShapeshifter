// Testul inițial (specs/10): pașii pe rând, „Omite” pe fiecare ecran, rezumat. Rulează ca pagină a extensiei,
// deschisă la instalare. Rezultatul se salvează întâi local (merge și fără server), apoi pe server, care îl face profil.

import { useEffect, useRef, useState } from "react";
import type { CSSProperties, FormEvent, ReactNode, SyntheticEvent } from "react";
import { DEFAULT_CONFIG } from "@uishapeshifter/contracts";
import type { OnboardingResult, PreferenceCategory, UserProfile } from "@uishapeshifter/contracts";
import { themeToCssVars } from "../ui/theme-css";
import { submitOnboarding } from "./api";
import {
  buildOnboardingResult,
  DISLIKE_CHOICES,
  DISLIKE_ORDER,
  FAMILIAR_SITE_CHOICES,
  FONT_CHOICES_PX,
  normalizeHost,
  skippedResult,
  summaryText,
  TECH_COMFORT_CHOICES,
  type OnboardingAnswers,
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
const SERVER_ERROR_TEXT = "Am păstrat răspunsurile pe calculatorul tău, dar serverul nu răspunde acum.";
/**
 * Testul rulează într-o pagină a extensiei, fără tema din store: își pune singur tema implicită și mărimile de start.
 * Exportat pentru ecranul de final din page.tsx, care folosește aceleași clase.
 */
export const ONBOARDING_STYLE = {
  ...themeToCssVars(DEFAULT_CONFIG.theme, DEFAULT_CONFIG.minTargetPx),
  "--onboarding-font": `${ONBOARDING_FONT_PX}px`,
  "--onboarding-target": `${ONBOARDING_TARGET_PX}px`,
} as CSSProperties;

const FONT_SAMPLE = "Ana ți-a trimis o poză cu pisica.";
const CONTRAST_SAMPLE = "Ion: Vin duminică la masă.";

type StepId = "welcome" | "font" | "contrast" | "touch" | "dislikes" | "sites" | "comfort" | "voice" | "summary";

const STEPS: { id: StepId; mascot: string; title: string }[] = [
  { id: "welcome", mascot: "Bună! Te ajut să-ți faci site-urile pe gustul tău.", title: "Bun venit" },
  { id: "font", mascot: "Pe care o citești ușor, fără să te apleci?", title: "Ce mărime de text îți place?" },
  { id: "contrast", mascot: "Care se vede mai bine?", title: "Ce se vede mai bine?" },
  { id: "touch", mascot: "Apasă pe cercul care apare. Fără grabă.", title: "Cât de mari să fie butoanele?" },
  { id: "dislikes", mascot: "Alege tot ce te deranjează. Le scot eu.", title: "Ce te deranjează pe site-uri?" },
  { id: "sites", mascot: "Pe cele cunoscute le las cum ești obișnuit.", title: "Ce site-uri cunoști bine?" },
  { id: "comfort", mascot: "Ca să știu cât să-ți explic.", title: "Cât de obișnuit ești cu calculatorul?" },
  { id: "voice", mascot: "Vrei să-mi vorbești în loc să scrii?", title: "Vrei să vorbești cu mine?" },
  { id: "summary", mascot: "", title: "Gata" }, // textul mascotei vine din răspunsuri (summaryText)
];

export interface OnboardingProps {
  userId: string;
  /** Profilul salvat pe server; `null` dacă serverul nu răspunde și omul a ales să continue. */
  onDone: (profile: UserProfile | null) => void;
  /** Salvarea locală (chrome.storage.local în extensie), înaintea serverului; o eroare aici oprește salvarea. */
  saveLocal?: (result: OnboardingResult) => Promise<void>;
  fetchFn?: typeof fetch;
  /** Pentru teste: pauza după schimbarea pasului (implicit STEP_INPUT_GUARD_MS). */
  inputGuardMs?: number;
}

type SaveState =
  | { status: "idle" }
  | { status: "saving" }
  | { status: "error"; message: string; result: OnboardingResult; savedLocally: boolean };

export function Onboarding({
  userId,
  onDone,
  saveLocal,
  fetchFn,
  inputGuardMs = STEP_INPUT_GUARD_MS,
}: OnboardingProps) {
  const [stepIndex, setStepIndex] = useState(0);
  const [answers, setAnswers] = useState<OnboardingAnswers>({});
  const [save, setSave] = useState<SaveState>({ status: "idle" });
  const [otherSite, setOtherSite] = useState("");
  const [otherSiteError, setOtherSiteError] = useState(false);
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
      await saveLocal?.(toSend);
    } catch (error) {
      console.error("onboarding: rezultatul nu s-a salvat local", error);
      setSave({ status: "error", message: SAVE_ERROR_TEXT, result: toSend, savedLocally: false });
      return;
    }
    try {
      onDone(await submitOnboarding(userId, toSend, fetchFn));
    } catch (error) {
      console.error("onboarding: rezultatul nu a ajuns la server", error);
      const savedLocally = saveLocal !== undefined;
      setSave({
        status: "error",
        message: savedLocally ? SERVER_ERROR_TEXT : SAVE_ERROR_TEXT,
        result: toSend,
        savedLocally,
      });
    }
  }

  function addOtherSite(event: FormEvent) {
    event.preventDefault();
    const host = normalizeHost(otherSite);
    if (!host) {
      setOtherSiteError(true);
      return;
    }
    setAnswers((prev) => ({ ...prev, familiarSites: unique([...(prev.familiarSites ?? []), host]) }));
    setOtherSite("");
    setOtherSiteError(false);
  }

  return (
    <main className="onboarding" style={ONBOARDING_STYLE} aria-labelledby="onboarding-title">
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
        {step.title}
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
              {save.savedLocally ? "Continuă" : "Continuă fără să salvez"}
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
        return <TouchTest onDone={(touch: TouchTrial[]) => next({ touch })} inputGuardMs={inputGuardMs} />;
      case "dislikes":
        return (
          <>
            <div className="onboarding__grid">
              {DISLIKE_ORDER.map((category: PreferenceCategory) => (
                <Toggle
                  key={category}
                  id={`onboarding.dislike.${category}`}
                  pressed={answers.dislikes?.includes(category) ?? false}
                  onClick={() => setAnswers((prev) => ({ ...prev, dislikes: toggle(prev.dislikes ?? [], category) }))}
                >
                  <span className="onboarding__icon" aria-hidden="true">
                    {DISLIKE_CHOICES[category].icon}
                  </span>
                  {DISLIKE_CHOICES[category].label}
                </Toggle>
              ))}
            </div>
            <PrimaryButton id="onboarding.next" onClick={() => next()}>
              Mai departe
            </PrimaryButton>
          </>
        );
      case "sites":
        return (
          <>
            <div className="onboarding__grid">
              {FAMILIAR_SITE_CHOICES.map(({ host, name }) => (
                <Toggle
                  key={host}
                  id={`onboarding.site.${host}`}
                  pressed={answers.familiarSites?.includes(host) ?? false}
                  onClick={() =>
                    setAnswers((prev) => ({ ...prev, familiarSites: toggle(prev.familiarSites ?? [], host) }))
                  }
                >
                  {name}
                </Toggle>
              ))}
            </div>
            <form className="onboarding__row" onSubmit={addOtherSite}>
              <label className="onboarding__label" htmlFor="onboarding-other-site">
                Alt site
              </label>
              <input
                id="onboarding-other-site"
                className="onboarding__input"
                value={otherSite}
                onChange={(event) => setOtherSite(event.target.value)}
                aria-invalid={otherSiteError}
                aria-describedby={otherSiteError ? "onboarding-other-site-error" : undefined}
                placeholder="ex. exemplu.ro"
                data-agent-id="onboarding.site.other"
              />
              <button type="submit" className="onboarding__secondary" data-agent-id="onboarding.site.add">
                Adaugă
              </button>
            </form>
            {otherSiteError && (
              <p id="onboarding-other-site-error" role="alert">
                Scrie adresa site-ului, de exemplu exemplu.ro.
              </p>
            )}
            {(answers.familiarSites ?? []).some((host) => !FAMILIAR_SITE_CHOICES.some((s) => s.host === host)) && (
              <p>
                Adăugate:{" "}
                {(answers.familiarSites ?? [])
                  .filter((h) => !FAMILIAR_SITE_CHOICES.some((s) => s.host === h))
                  .join(", ")}
              </p>
            )}
            <PrimaryButton id="onboarding.next" onClick={() => next()}>
              Mai departe
            </PrimaryButton>
          </>
        );
      case "comfort":
        return (
          <div className="onboarding__row">
            {(Object.keys(TECH_COMFORT_CHOICES) as (keyof typeof TECH_COMFORT_CHOICES)[]).map((level) => (
              <Choice
                key={level}
                id={`onboarding.comfort.${level}`}
                selected={answers.techComfort === level}
                onClick={() => next({ techComfort: level })}
              >
                {TECH_COMFORT_CHOICES[level]}
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
            {save.status === "saving" ? "Salvez…" : "Gata"}
          </PrimaryButton>
        );
    }
  }
}

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

/** Un card de alegere multiplă: apăsat o dată e ales, încă o dată nu mai e. */
function Toggle(props: { id: string; pressed: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      className="onboarding__card"
      aria-pressed={props.pressed}
      onClick={props.onClick}
      data-agent-id={props.id}
    >
      {props.children}
    </button>
  );
}

function toggle<T>(items: T[], item: T): T[] {
  return items.includes(item) ? items.filter((x) => x !== item) : [...items, item];
}

function unique<T>(items: T[]): T[] {
  return [...new Set(items)];
}
