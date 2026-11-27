// Pasul `run_js` (modul expert, experiment, specs/05) în panou: ce a vrut agentul să facă, codul întreg și ce s-a
// întâmplat cu el. Codul stă la vedere, nu doar în JSON-ul pasului: omul și juriul văd exact ce a rulat în pagină.

import type { AgentStep, RunJsData } from "@uishapeshifter/contracts";

export interface RunJsView {
  purpose: string;
  code: string;
  /** Lipsește cât timp pasul n-are încă rezultat (omul n-a ales Rulează / Nu rula). */
  status?: RunJsData["status"];
  detail?: string;
}

const STATUS_TEXT: Record<RunJsData["status"], string> = {
  ran: "A rulat, după ce l-ai aprobat. Nu se anulează din panou: reîncarcă pagina ca să scapi de el.",
  declined: "Nu l-ai rulat.",
  // Pașii de pornire stau aici, nu doar în ce spune modelul: omul află mereu cum îl pornește (aceiași pași ca în popup)
  disabled:
    "Modul expert e oprit, deci codul nu a rulat. Ca să-l pornești: apasă butonul extensiei, sus în browser, și " +
    "bifează „Mod expert”. Apoi, în chrome://extensions → UI Shapeshifter → Details, pornește „Allow User Scripts”. " +
    "După aceea cere din nou.",
};

const RUN_JS_STATUSES = Object.keys(STATUS_TEXT);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

/** Argumentele și rezultatul vin de la model prin server, deci le verificăm înainte să le arătăm. */
export function runJsView(step: AgentStep): RunJsView | null {
  if (step.tool !== "run_js" || !isRecord(step.args)) return null;
  const { code, purpose } = step.args;
  if (typeof code !== "string" || typeof purpose !== "string") return null;
  const view: RunJsView = { code, purpose };
  const result = step.result;
  if (result?.ok === false) {
    view.detail = result.error.message;
  } else if (result?.ok && isRecord(result.data)) {
    const { status, result: value, error } = result.data;
    if (typeof status === "string" && RUN_JS_STATUSES.includes(status)) view.status = status as RunJsData["status"];
    if (typeof error === "string") view.detail = `Eroare: ${error}`;
    else if (typeof value === "string" && value !== "") view.detail = `A întors: ${value}`;
  }
  return view;
}

export function RunJsStep({ view }: { view: RunJsView }) {
  return (
    <div className="journal-js" data-agent-id="journal-panel.run-js">
      <p className="journal-js-purpose">⚡ Cod în pagină: {view.purpose}</p>
      <pre className="journal-js-code">{view.code}</pre>
      {view.status && <p>{STATUS_TEXT[view.status]}</p>}
      {view.detail && <p className="journal-js-detail">{view.detail}</p>}
    </div>
  );
}
