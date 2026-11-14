// Bucla agentului (specs/05): decide → execută unealta (pe web sau aici) → jurnal → din nou, până la finish.
// Cine decide e separat (Decider): agentul fals acum (A1), OpenRouter în A2. Bucla rămâne aceeași.

import {
  RUN_LIMITS,
  TOOL_RUNS_ON,
  type AgentRun,
  type AgentStep,
  type MascotState,
  type ServerMessage,
  type ToolName,
  type ToolResult,
} from "@uishapeshifter/contracts";
import { createFailureGuard } from "./failure-guard";
import { OpenRouterError } from "./openrouter";
import { parseReasoning, withToolFallback } from "./reasoning";

/** Ce vrea agentul să facă la pasul curent. */
export type Decision =
  { kind: "tool"; content: string; name: ToolName; args: unknown } | { kind: "text"; content: string }; // fără tool call: tratat ca say + finish (specs/05)

export interface PreviousStep {
  name: ToolName;
  args: unknown;
  result: ToolResult;
}

/** Cine decide pasul următor; primește rezultatul pasului trecut (null la primul pas). */
export interface Decider {
  model: string;
  decide(previous: PreviousStep | null): Promise<Decision>;
}

/** Legătura rulării cu lumea: frontend-ul (prin WebSocket), uneltele de pe server și jurnalul. */
export interface RunIO {
  callWebTool(name: ToolName, args: unknown): Promise<ToolResult>;
  callServerTool(name: ToolName, args: unknown): Promise<ToolResult>;
  send(message: ServerMessage): void;
  saveRun(run: AgentRun): Promise<void>;
  isCancelled(): boolean;
  /** Oprită pentru că omul a pornit altă rulare: fără agent_message, ca bula să arate doar rularea nouă. */
  isReplaced(): boolean;
}

const MAX_STEPS_SUMMARY = "M-am oprit după prea mulți pași. Am păstrat ce am reușit până acum.";
const CANCELLED_SUMMARY = "Am oprit, cum ai cerut.";
const EMPTY_REPLY_SUMMARY = "N-am reușit să încep: modelul n-a răspuns. Încearcă din nou, te rog.";
const UNDONE_SUMMARY = "Am pus pagina înapoi, cum ai ales.";

/** „keep” / „undo” dacă ultimul pas a fost o propunere la care omul a răspuns. */
function proposalDecision(previous: PreviousStep | null): "keep" | "undo" | undefined {
  if (previous?.name !== "propose_changes" || !previous.result.ok) return undefined;
  const decision = (previous.result.data as { decision?: unknown } | undefined)?.decision;
  return decision === "keep" || decision === "undo" ? decision : undefined;
}

function proposalSummary(previous: PreviousStep | null): string {
  const summary = (previous?.args as { summary?: unknown } | undefined)?.summary;
  return typeof summary === "string" && summary.trim() ? summary.trim() : "Gata, ai păstrat schimbarea.";
}
const CRASH_SUMMARY = "Am o problemă și m-am oprit. Încearcă din nou, te rog.";
const pageChangedSummary = (from: string, to: string) =>
  `Ai trecut de pe ${from} pe ${to} cât lucram, așa că m-am oprit ca să nu schimb site-ul greșit. Cere-mi din nou aici.`;
// după reîncercările din openrouter.ts (specs/05, „Eșecuri”)
const CONNECTION_SUMMARY = "Am o problemă de conexiune, încerc din nou imediat.";

/** Revizia rețetei site-ului după pas: din apply_css / apply_ops (`revision`) sau din snapshot (`recipe.revision`). */
function recipeRevisionOf(result: ToolResult): number | undefined {
  if (!result.ok) return undefined;
  const data = result.data as { revision?: unknown; recipe?: { revision?: unknown } } | null;
  const revision = data?.revision ?? data?.recipe?.revision;
  return typeof revision === "number" ? revision : undefined;
}

function finishArgs(args: unknown): { summary: string; success: boolean } {
  const { summary, success } = (args ?? {}) as { summary?: unknown; success?: unknown };
  return {
    summary: typeof summary === "string" && summary.trim() ? summary : "Am terminat.",
    success: success !== false,
  };
}

export interface RunOptions {
  /** Site-ul de pe care a pornit cererea; dacă snapshot-ul arată alt site, rularea se oprește (pagină schimbată). */
  host?: string;
}

/** Host-ul din rezultatul unui get_page_snapshot, dacă se poate citi. */
function snapshotHost(name: ToolName, result: ToolResult): string | undefined {
  if (name !== "get_page_snapshot" || !result.ok) return undefined;
  const host = (result.data as { host?: unknown } | null)?.host;
  return typeof host === "string" ? host : undefined;
}

export async function runAgent(
  run: AgentRun,
  decider: Decider,
  io: RunIO,
  options: RunOptions = {},
): Promise<AgentRun> {
  let previous: PreviousStep | null = null;
  let lastAnswered: PreviousStep | null = null;
  let lastRevision: number | undefined;
  const guard = createFailureGuard();

  const end = async (status: AgentRun["status"], summary: string, mascot: MascotState) => {
    run.status = status;
    run.summary = summary;
    run.finishedAt = new Date().toISOString();
    // jurnalul nesalvat nu trebuie să lase interfața fără run_finished
    await io.saveRun(run).catch((error: unknown) => console.error(`agent: n-am salvat ${run.runId}:`, error));
    if (!(status === "cancelled" && io.isReplaced())) {
      io.send({ type: "agent_message", runId: run.runId, text: summary, mascot });
    }
    io.send({ type: "run_finished", runId: run.runId, success: status === "succeeded", summary });
    return run;
  };

  try {
    for (let index = 0; index < RUN_LIMITS.maxSteps; index++) {
      if (io.isCancelled()) return await end("cancelled", CANCELLED_SUMMARY, "idle");

      const decision = await decider.decide(previous);
      // „Oprește” apăsat cât gândea modelul: unealta decisă nu mai pleacă spre interfață
      if (io.isCancelled()) return await end("cancelled", CANCELLED_SUMMARY, "idle");
      if (decision.kind === "text") {
        // Un răspuns gol (fără text și fără unealtă) e un refuz sau o eroare a modelului, nu o rulare reușită
        // (Opus 5.5 refuza tot la început, iar panoul arăta „Am terminat.”).
        const text = decision.content.trim();
        return text ? await end("succeeded", text, "happy") : await end("failed", EMPTY_REPLY_SUMMARY, "confused");
      }

      const startedAt = Date.now();
      // un eșec deja văzut nu mai pleacă spre pagină; modelul primește în loc ce să facă altfel
      const result =
        guard.check(decision.name, decision.args) ??
        (TOOL_RUNS_ON[decision.name] === "web"
          ? await io.callWebTool(decision.name, decision.args)
          : await io.callServerTool(decision.name, decision.args));
      guard.record(decision.name, decision.args, result);

      const revisionAfter = recipeRevisionOf(result) ?? lastRevision;
      const step: AgentStep = {
        runId: run.runId,
        index,
        ts: new Date(startedAt).toISOString(),
        ...withToolFallback(parseReasoning(decision.content), decision.name, decision.args),
        tool: decision.name,
        args: decision.args,
        result,
        durationMs: Date.now() - startedAt,
        recipeRevisionBefore: lastRevision,
        recipeRevisionAfter: revisionAfter,
      };
      lastRevision = revisionAfter;
      run.steps.push(step);
      await io.saveRun(run);
      io.send({ type: "step", step });

      const seenHost = snapshotHost(decision.name, result);
      if (options.host && seenHost && seenHost !== options.host) {
        // omul a plecat pe alt site în timpul rulării: rețeta e a site-ului de la început, nu mai schimbăm nimic
        return await end("failed", pageChangedSummary(options.host, seenHost), "confused");
      }

      if (decision.name === "finish" && result.ok) {
        const { summary, success } = finishArgs(decision.args);
        return await end(success ? "succeeded" : "failed", summary, success ? "happy" : "confused");
      }
      previous = { name: decision.name, args: decision.args, result };
      if (proposalDecision(previous)) lastAnswered = previous;
    }
    // Pașii s-au terminat după ce omul a ales deja Păstrez sau Anulez: rularea e încheiată, nu eșuată.
    // Ultima propunere la care a răspuns omul, oriunde în rulare: după Păstrez agentul mai poate nota în profil
    // (update_profile), iar pașii se pot termina înainte de finish (repetiția pe Opus, pasul 4).
    const decided = proposalDecision(lastAnswered);
    if (decided === "keep") return await end("succeeded", proposalSummary(lastAnswered), "happy");
    if (decided === "undo") return await end("succeeded", UNDONE_SUMMARY, "idle");
    return await end("failed", MAX_STEPS_SUMMARY, "confused");
  } catch (error) {
    if (error instanceof OpenRouterError) {
      console.error(`agent: rularea ${run.runId} oprită, OpenRouter nu răspunde: ${error.message}`);
      return await end("failed", CONNECTION_SUMMARY, "confused");
    }
    console.error(`agent: rularea ${run.runId} a căzut:`, error);
    return await end("failed", CRASH_SUMMARY, "confused");
  }
}
