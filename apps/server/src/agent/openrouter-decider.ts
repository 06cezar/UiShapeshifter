// Cine decide în bucla reală: modelul din OpenRouter, cu tool calling (specs/05).
// Ține istoricul conversației cu modelul; bucla din run-agent.ts îi dă rezultatul fiecărui pas.

import {
  siteToolDefinitions,
  TOOL_RUNS_ON,
  type PageInfo,
  type SiteToolStage,
  type ToolName,
} from "@uishapeshifter/contracts";
import { compactResult } from "./compact-result";
import { chatCompletionWithRetry, RETRY_DELAYS_MS, type ChatMessage } from "./openrouter";
import type { Decider, Decision } from "./run-agent";
import { buildSystemPrompt, userMessage, type ProfileContext } from "./system-prompt";

const TEMPERATURE = 0.2; // mică, pentru un demo previzibil (specs/05)
const DEFAULT_MODEL = "anthropic/claude-haiku-5.5";
// de câte ori îi cerem modelului să repare un tool call stricat (nume necunoscut, JSON invalid) în același pas
const MAX_MALFORMED_CALLS = 2;

/** O definiție de unealtă în formatul OpenAI / OpenRouter. */
export interface ToolDefinition {
  type: "function";
  function: { name: string; description: string; parameters: unknown };
}

function isToolName(name: string): name is ToolName {
  return Object.hasOwn(TOOL_RUNS_ON, name);
}

function parseArgs(raw: string): Record<string, unknown> | null {
  try {
    const value: unknown = JSON.parse(raw || "{}");
    return typeof value === "object" && value !== null && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
}

/**
 * Unelte din contracte pe care extensia nu le execută încă (page-tools.ts le respinge cu INVALID_ARGS): la limit
 * testing modelul le chema în 7 cereri din 17 și pierdea un pas. Se scot de aici când extensia le are.
 */
export const NOT_IN_EXTENSION_YET: ReadonlySet<string> = new Set(["ask_user", "wait_for_user_click"]);

export function extensionToolDefinitions(stage: SiteToolStage): ToolDefinition[] {
  return siteToolDefinitions(stage).filter((definition) => !NOT_IN_EXTENSION_YET.has(definition.function.name));
}

export interface OpenRouterDeciderOptions {
  /** Etapa extensiei: alege uneltele (siteToolDefinitions) și secțiunile promptului. Implicit 1. */
  stage?: SiteToolStage;
  /** Uneltele etapei la care e extensia; etapa 1: get_page_snapshot, apply_css, say, finish (specs/05). */
  definitions?: readonly ToolDefinition[];
  /** Site-ul de pe care a scris omul; lipsește pe pagina de probă. */
  page?: PageInfo;
  retryDelaysMs?: readonly number[]; // testele le pun pe 0
  /** Profilul omului pentru prompt (etapa 3); se încarcă la primul pas, ca rularea să pornească imediat. */
  loadProfile?: () => Promise<ProfileContext>;
}

export function createOpenRouterDecider(goal: string, options: OpenRouterDeciderOptions = {}): Decider {
  const { stage = 1, page, retryDelaysMs = RETRY_DELAYS_MS } = options;
  const definitions = options.definitions ?? extensionToolDefinitions(stage);
  const model = process.env.OPENROUTER_MODEL || DEFAULT_MODEL;
  const allowed = new Set<string>(definitions.map((definition) => definition.function.name));
  const messages: ChatMessage[] = [];
  let pendingCallId: string | null = null;

  return {
    model,
    async decide(previous): Promise<Decision> {
      if (messages.length === 0) {
        const profile = await options.loadProfile?.().catch((error: unknown) => {
          console.warn("agent: profilul pentru prompt n-a putut fi încărcat:", error);
          return undefined;
        });
        messages.push(
          { role: "system", content: buildSystemPrompt({ page, stage, profile, tools: allowed }) },
          { role: "user", content: userMessage(goal, page) },
        );
      }
      if (previous && pendingCallId) {
        messages.push({
          role: "tool",
          tool_call_id: pendingCallId,
          content: compactResult(previous.name, previous.result),
        });
        pendingCallId = null;
      }

      for (let attempt = 0; ; attempt++) {
        const reply = await chatCompletionWithRetry(
          { model, messages, tools: definitions, temperature: TEMPERATURE },
          retryDelaysMs,
        );
        const call = reply.toolCalls[0]; // parallel_tool_calls: false → cel mult unul; dacă vin mai multe, primul
        const content = reply.content ?? "";
        if (!call) {
          messages.push({ role: "assistant", content });
          return { kind: "text", content };
        }
        messages.push({ role: "assistant", content: reply.content, tool_calls: [call] });

        const args = parseArgs(call.function.arguments);
        const name = call.function.name;
        if (isToolName(name) && allowed.has(name) && args) {
          pendingCallId = call.id;
          return { kind: "tool", content, name, args };
        }
        // tool call stricat: îi spunem modelului ce n-a mers, fără să ajungă la frontend
        const problem =
          !isToolName(name) || !allowed.has(name)
            ? `Unealta „${name}” nu există aici. Folosește doar: ${[...allowed].join(", ")}.`
            : "Argumentele nu sunt un obiect JSON valid.";
        messages.push({
          role: "tool",
          tool_call_id: call.id,
          content: JSON.stringify({ ok: false, error: { code: "INVALID_ARGS", message: problem } }),
        });
        if (attempt + 1 >= MAX_MALFORMED_CALLS) {
          return { kind: "text", content: "Nu am reușit să duc cererea la capăt. Încearcă să o spui altfel." };
        }
      }
    },
  };
}
