// Panoul de control (specs/11): ce face agentul acum, pas cu pas, cu Oprește, Păstrez / Anulez, scorul de
// accesibilitate, „Revino la original” și reluarea pas cu pas a unei rulări terminate.
// Mesajele vin în `journal` de la cine ține legătura cu serverul; `send` trimite `cancel_run` înapoi.
// În extensie (D9) stă în shadow DOM-ul nostru, peste site; stilul e în journal-styles.ts.

import { useEffect, useState } from "react";
import { useStore } from "zustand";
import type { AgentRun, AgentStep, ClientMessage, ToolName } from "@uishapeshifter/contracts";
import { activeRun, auditScores, revisionAtStep } from "./journal-store";
import type { JournalStore, RunStatus, RunView } from "./journal-store";

export interface JournalPanelProps {
  journal: JournalStore;
  send: (message: ClientMessage) => void;
  /** Citește o rulare terminată (GET /api/runs/:runId); fără ea, panoul nu oferă reluarea pas cu pas. */
  loadRun?: (runId: string) => Promise<AgentRun>;
  /** „Revino la original”: golește rețeta site-ului curent; fără ea, butonul nu apare. */
  revertToOriginal?: () => Promise<void>;
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
  const [open, setOpen] = useState(true);
  const runs = useStore(journal, (s) => s.runs);
  const replay = useStore(journal, (s) => s.replay);
  const proposal = useStore(journal, (s) => s.proposal);
  const current = activeRun(runs) ?? runs[runs.length - 1];

  // Pe un site unde agentul n-a lucrat încă, panoul nu ocupă loc.
  if (!current && !proposal && !replay) return null;

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
      <ol className="journal-steps" aria-live="polite">
        {run.steps.map((step) => (
          <li key={step.index}>
            <StepRow step={step} />
          </li>
        ))}
      </ol>
    </section>
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
