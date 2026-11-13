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
const CRASH_SUMMARY = "Am o problemă și m-am oprit. Încearcă din nou, te rog.";
// după reîncercările din openrouter.ts (specs/05, „Eșecuri”)
const CONNECTION_SUMMARY = "Am o problemă de conexiune, încerc din nou imediat.";

function revisionOf(result: ToolResult): number | undefined {
  if (!result.ok) return undefined;
  const data = result.data as { revision?: unknown; configRevision?: unknown } | null;
  const revision = data?.revision ?? data?.configRevision;
  return typeof revision === "number" ? revision : undefined;
}

function finishArgs(args: unknown): { summary: string; success: boolean } {
  const { summary, success } = (args ?? {}) as { summary?: unknown; success?: unknown };
  return {
    summary: typeof summary === "string" && summary.trim() ? summary : "Am terminat.",
    success: success !== false,
  };
}

export async function runAgent(run: AgentRun, decider: Decider, io: RunIO): Promise<AgentRun> {
  let previous: PreviousStep | null = null;
  let lastRevision: number | undefined;

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
      if (decision.kind === "text") return await end("succeeded", decision.content.trim() || "Am terminat.", "happy");

      const startedAt = Date.now();
      const result =
        TOOL_RUNS_ON[decision.name] === "web"
          ? await io.callWebTool(decision.name, decision.args)
          : await io.callServerTool(decision.name, decision.args);

      const revisionAfter = revisionOf(result) ?? lastRevision;
      const step: AgentStep = {
        runId: run.runId,
        index,
        ts: new Date(startedAt).toISOString(),
        ...withToolFallback(parseReasoning(decision.content), decision.name, decision.args),
        tool: decision.name,
        args: decision.args,
        result,
        durationMs: Date.now() - startedAt,
        configRevisionBefore: lastRevision,
        configRevisionAfter: revisionAfter,
      };
      lastRevision = revisionAfter;
      run.steps.push(step);
      await io.saveRun(run);
      io.send({ type: "step", step });

      if (decision.name === "finish" && result.ok) {
        const { summary, success } = finishArgs(decision.args);
        return await end(success ? "succeeded" : "failed", summary, success ? "happy" : "confused");
      }
      previous = { name: decision.name, args: decision.args, result };
    }
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
