// Panoul de control (specs/11): ce face agentul acum, pas cu pas, cu Oprește, Păstrez / Anulez, scorul de
// accesibilitate, „Revino la original” și reluarea pas cu pas a unei rulări terminate.
// Mesajele vin în `journal` de la cine ține legătura cu serverul; `send` trimite `cancel_run` înapoi.
// În extensie (D9) stă în shadow DOM-ul nostru, peste site; stilul e în journal-styles.ts.

import { useEffect, useState } from "react";
import { useStore } from "zustand";
import type { AgentRun, AgentStep, ClientMessage, ToolName } from "@uishapeshifter/contracts";
import { activeRun, auditScores, revisionAtStep } from "./journal-store";
import type { JournalStore, RunStatus, RunView } from "./journal-store";
import type { RequestEntry } from "../validation";

export interface JournalPanelProps {
  journal: JournalStore;
  send: (message: ClientMessage) => void;
  /** Citește o rulare terminată (GET /api/runs/:runId); fără ea, panoul nu oferă reluarea pas cu pas. */
  loadRun?: (runId: string) => Promise<AgentRun>;
  /** „Revino la original”: golește rețeta site-ului curent; fără ea, butonul nu apare. */
  revertToOriginal?: () => Promise<void>;
  /** Cererile din istoricul rețetei site-ului (`requestHistory`, C); fără ea, lista „Ce ai cerut aici” nu apare. */
  requestHistory?: () => RequestEntry[];
  /** Scoate o singură cerere din rețetă; cererile de după rămân. Întoarce mesajul de eroare, dacă nu s-a putut. */
  undoRequest?: (requestId: string) => Promise<{ ok: true } | { ok: false; message: string }>;
}

const TOOL_ICONS: Record<ToolName, string> = {
  get_page_snapshot: "👀",
  apply_css: "🎨",
  apply_ops: "🧱",
  get_ui_snapshot: "👀",
  patch_config: "🛠️",
  apply_template: "🧩",
  generate_component: "✨",
  remove_component: "🗑️",
  navigate: "🧭",
  point_at: "👉",
  wait_for_user_click: "⏳",
  ask_user: "❓",
  propose_changes: "💡",
  undo_request: "↩️",
  audit_ui: "🔍",
  say: "💬",
  get_profile: "📇",
  update_profile: "📝",
  finish: "🏁",
};

const STATUS_TEXT: Record<RunStatus, string> = {
  running: "În lucru",
  succeeded: "Reușit",
  failed: "Nereușit",
  cancelled: "Oprit",
};

export function JournalPanel(props: JournalPanelProps) {
  const { journal } = props;
  /** Ce a ales omul cu „Arată / Ascunde”; până alege, panoul e deschis cât lucrează agentul și strâns altfel. */
  const [chosenOpen, setChosenOpen] = useState<boolean | null>(null);
  const runs = useStore(journal, (s) => s.runs);
  const replay = useStore(journal, (s) => s.replay);
  const proposal = useStore(journal, (s) => s.proposal);
  const current = activeRun(runs) ?? runs[runs.length - 1];
  const activeNow = Boolean(current || proposal || replay);
  // După F5 nu e nicio rulare în pagină, dar site-ul poate avea cereri de ieri: „Ce ai cerut aici” trebuie să se vadă.
  const hasHistory = (props.requestHistory?.().length ?? 0) > 0;

  // Pe un site unde agentul n-a lucrat niciodată, panoul nu ocupă loc.
  if (!activeNow && !hasHistory) return null;
  const open = chosenOpen ?? activeNow;
  const setOpen = (next: boolean) => setChosenOpen(next);

  return (
    <aside className="journal" data-agent-id="journal-panel" aria-label="Panoul de control">
      <div className="journal-header">
        <h2>Ce face ratonul</h2>
        <button type="button" data-agent-id="journal-panel.toggle" aria-expanded={open} onClick={() => setOpen(!open)}>
          {open ? "Ascunde" : "Arată"}
        </button>
      </div>
      {open && (
        <div className="journal-body">
          <ProposalBar journal={journal} />
          {replay ? <ReplayView journal={journal} /> : current ? <RunSection run={current} {...props} /> : null}
          {props.requestHistory && props.undoRequest && (
            <RequestHistory journal={journal} history={props.requestHistory} undo={props.undoRequest} />
          )}
          {props.revertToOriginal && (
            <RevertToOriginal journal={journal} send={props.send} revert={props.revertToOriginal} />
          )}
        </div>
      )}
    </aside>
  );
}

function ProposalBar({ journal }: { journal: JournalStore }) {
  const proposal = useStore(journal, (s) => s.proposal);
  if (!proposal) return null;
  const decide = journal.getState().decideProposal;
  return (
    <section className="journal-proposal" aria-label="Propunere">
      <p>
        <strong>{proposal.title}</strong>: {proposal.summary}
      </p>
      <div className="journal-actions">
        <button type="button" data-agent-id="journal-panel.keep" onClick={() => decide("keep")}>
          Păstrez
        </button>
        <button type="button" data-agent-id="journal-panel.undo" onClick={() => decide("undo")}>
          Anulez
        </button>
      </div>
    </section>
  );
}

function RunSection({ run, journal, send, loadRun }: { run: RunView } & JournalPanelProps) {
  const [loadError, setLoadError] = useState<string | null>(null);
  const cancelRequested = useStore(journal, (s) => s.cancelRequested.includes(run.runId));

  function stop() {
    journal.getState().markCancelRequested(run.runId);
    send({ type: "cancel_run", runId: run.runId });
  }

  async function startReplay() {
    if (!loadRun) return;
    setLoadError(null);
    try {
      journal.getState().startReplay(await loadRun(run.runId));
    } catch {
      setLoadError("Nu am putut încărca rularea. Încearcă din nou.");
    }
  }

  return (
    <section className="journal-run" aria-label="Rularea curentă">
      <p className="journal-goal">
        <span className={`journal-status journal-status-${run.status}`}>{STATUS_TEXT[run.status]}</span> {run.goal}
      </p>
      <AuditScore steps={run.steps} />
      {run.status === "running" ? (
        <button type="button" data-agent-id="journal-panel.stop" disabled={cancelRequested} onClick={stop}>
          {cancelRequested ? "Se oprește…" : "Oprește"}
        </button>
      ) : (
        <>
          {run.summary && <p>{run.summary}</p>}
          {loadRun && (
            <button type="button" data-agent-id="journal-panel.replay" onClick={() => void startReplay()}>
              Reia pas cu pas
            </button>
          )}
          {loadError && <p role="alert">{loadError}</p>}
        </>
      )}
      {run.status === "running" ? (
        <StepList steps={run.steps} />
      ) : (
        // După rulare, pașii se strâng sub un titlu: panoul nu mai acoperă pagina (proba lui E), dar bucla rămâne
        // la un click distanță.
        <details className="journal-steps-done">
          <summary data-agent-id="journal-panel.steps">Pașii ({run.steps.length})</summary>
          <StepList steps={run.steps} />
        </details>
      )}
    </section>
  );
}

function StepList({ steps }: { steps: readonly AgentStep[] }) {
  return (
    <ol className="journal-steps" aria-live="polite">
      {steps.map((step) => (
        <li key={step.index}>
          <StepRow step={step} />
        </li>
      ))}
    </ol>
  );
}

function AuditScore({ steps }: { steps: readonly AgentStep[] }) {
  const { before, after } = auditScores(steps);
  if (before === undefined) return null;
  return (
    <p className="journal-score">
      Accesibilitate: {before}
      {after !== undefined && ` → ${after}`} din 100
    </p>
  );
}

function StepRow({ step }: { step: AgentStep }) {
  const failed = step.result?.ok === false;
  const outcome = step.result ? (failed ? "fail" : "ok") : "none";
  return (
    <details className={`journal-step journal-step-${outcome}`}>
      <summary>
        <span aria-hidden="true">{step.tool ? TOOL_ICONS[step.tool] : "•"}</span> {step.decision}
        {failed && <span className="journal-step-failed"> (nu a mers)</span>}
      </summary>
      <dl>
        <dt>Observ</dt>
        <dd>{step.observation}</dd>
        <dt>Fac</dt>
        <dd>{step.decision}</dd>
        <dt>Pentru că</dt>
        <dd>{step.reason}</dd>
      </dl>
      {step.tool && (
        <pre className="journal-json">
          {JSON.stringify({ tool: step.tool, args: step.args, result: step.result }, null, 2)}
        </pre>
      )}
    </details>
  );
}

function ReplayView({ journal }: { journal: JournalStore }) {
  const replay = useStore(journal, (s) => s.replay);
  if (!replay) return null;
  const { run, index } = replay;
  const { replayTo, stopReplay } = journal.getState();
  const step = run.steps[index];
  const last = run.steps.length - 1;
  const revision = step ? revisionAtStep(step) : undefined;

  return (
    <section className="journal-replay" aria-label="Reluare pas cu pas">
      <p className="journal-goal">Reluare: {run.goal}</p>
      <div className="journal-actions">
        <button
          type="button"
          data-agent-id="journal-panel.replay-first"
          aria-label="Primul pas"
          disabled={index === 0}
          onClick={() => replayTo(0)}
        >
          ⏮
        </button>
        <button
          type="button"
          data-agent-id="journal-panel.replay-prev"
          aria-label="Pasul anterior"
          disabled={index === 0}
          onClick={() => replayTo(index - 1)}
        >
          ◀
        </button>
        <button
          type="button"
          data-agent-id="journal-panel.replay-next"
          aria-label="Pasul următor"
          disabled={index >= last}
          onClick={() => replayTo(index + 1)}
        >
          ▶
        </button>
        <button
          type="button"
          data-agent-id="journal-panel.replay-last"
          aria-label="Ultimul pas"
          disabled={index >= last}
          onClick={() => replayTo(last)}
        >
          ⏭
        </button>
      </div>
      {step ? (
        <>
          <p role="status">
            Pasul {index + 1} din {run.steps.length}
            {revision !== undefined && `, revizia ${revision}`}
          </p>
          <StepRow step={step} />
        </>
      ) : (
        <p>Rularea nu are pași.</p>
      )}
      <button type="button" data-agent-id="journal-panel.replay-close" onClick={stopReplay}>
        Închide reluarea
      </button>
    </section>
  );
}

/**
 * „Revino la original”: site-ul arată din nou ca înainte de orice schimbare a noastră (golește rețeta).
 * Merge și cât rulează agentul: întâi oprim rularea (altfel o unealtă aflată deja pe drum scrie la loc peste pagina
 * golită), închidem propunerea deschisă, golim rețeta, iar când rularea chiar s-a oprit o golim încă o dată.
 */
function RevertToOriginal({
  journal,
  send,
  revert,
}: {
  journal: JournalStore;
  send: (message: ClientMessage) => void;
  revert: () => Promise<void>;
}) {
  const [done, setDone] = useState(false);
  const [stoppingRunId, setStoppingRunId] = useState<string | null>(null);
  const stoppingStatus = useStore(journal, (s) => s.runs.find((r) => r.runId === stoppingRunId)?.status);

  useEffect(() => {
    if (!stoppingRunId || stoppingStatus === "running") return;
    setStoppingRunId(null);
    void revert().then(() => setDone(true));
  }, [stoppingRunId, stoppingStatus, revert]);

  function revertNow() {
    setDone(false);
    const state = journal.getState();
    const running = activeRun(state.runs);
    if (running?.status === "running") {
      state.markCancelRequested(running.runId);
      send({ type: "cancel_run", runId: running.runId });
      setStoppingRunId(running.runId);
    }
    // „Păstrez”, nu „Anulez”: anularea ar readuce revizia de la începutul rulării, adică exact ce vrem să scoatem.
    if (state.proposal) state.decideProposal("keep");
    void revert().then(() => setDone(true));
  }

  return (
    <div className="journal-actions">
      <button type="button" data-agent-id="journal-panel.revert-original" onClick={revertNow}>
        Revino la original
      </button>
      {stoppingRunId ? (
        <p role="status">Opresc agentul și readuc site-ul la început…</p>
      ) : (
        done && <p role="status">Site-ul arată din nou ca la început.</p>
      )}
    </div>
  );
}

/**
 * „Ce ai cerut aici”: fiecare cerere care a schimbat site-ul, cu „Anulez” doar pe ea. Spre deosebire de „Anulez” din
 * propunere (întoarce rețeta la începutul rulării), aici cererile de după rămân. Lista se recitește la fiecare rulare.
 */
function RequestHistory({
  journal,
  history,
  undo,
}: {
  journal: JournalStore;
  history: () => RequestEntry[];
  undo: NonNullable<JournalPanelProps["undoRequest"]>;
}) {
  // Abonarea la rulări și `setVersion` doar re-randează lista: istoricul se recitește după o rulare sau o anulare.
  const running = useStore(journal, (s) => activeRun(s.runs)?.status === "running");
  const [, setVersion] = useState(0);
  const [status, setStatus] = useState<string | null>(null);
  const entries = history();
  if (entries.length === 0) return null;

  async function undoOne(entry: RequestEntry) {
    setStatus(null);
    const result = await undo(entry.requestId);
    setStatus(result.ok ? `Am scos: ${entry.reason}` : result.message);
    setVersion((v) => v + 1);
  }

  return (
    <section className="journal-history" aria-label="Ce ai cerut aici">
      <h3>Ce ai cerut aici</h3>
      <ol>
        {entries.map((entry) => (
          <li key={entry.requestId} className="journal-history-entry">
            <span>{entry.reason}</span>
            <button
              type="button"
              data-agent-id={`journal-panel.undo-request.${entry.requestId}`}
              aria-label={`Anulez: ${entry.reason}`}
              disabled={running}
              onClick={() => void undoOne(entry)}
            >
              Anulez
            </button>
          </li>
        ))}
      </ol>
      {status && <p role="status">{status}</p>}
    </section>
  );
}
