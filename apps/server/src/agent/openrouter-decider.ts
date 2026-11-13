// Cine decide în bucla reală: modelul din OpenRouter, cu tool calling (specs/05).
// Ține istoricul conversației cu modelul; bucla din run-agent.ts îi dă rezultatul fiecărui pas.

import { TOOL_DEFINITIONS, TOOL_RUNS_ON, type ToolName } from "@uishapeshifter/contracts";
import { compactResult } from "./compact-result";
import { chatCompletionWithRetry, RETRY_DELAYS_MS, type ChatMessage } from "./openrouter";
import type { Decider, Decision } from "./run-agent";
import { buildSystemPrompt } from "./system-prompt";

const TEMPERATURE = 0.2; // mică, pentru un demo previzibil (specs/05)
const DEFAULT_MODEL = "anthropic/claude-haiku-5.5";
// de câte ori îi cerem modelului să repare un tool call stricat (nume necunoscut, JSON invalid) în același pas
const MAX_MALFORMED_CALLS = 2;

// A2: drumul „fă textul mai mare”. A3 deschide restul uneltelor.
export const A2_TOOLS: readonly ToolName[] = ["get_ui_snapshot", "patch_config", "point_at", "finish"];

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

export interface OpenRouterDeciderOptions {
  tools?: readonly ToolName[];
  retryDelaysMs?: readonly number[]; // testele le pun pe 0
}

export function createOpenRouterDecider(goal: string, options: OpenRouterDeciderOptions = {}): Decider {
  const { tools = A2_TOOLS, retryDelaysMs = RETRY_DELAYS_MS } = options;
  const model = process.env.OPENROUTER_MODEL || DEFAULT_MODEL;
  const allowed = new Set<ToolName>(tools);
  const definitions = TOOL_DEFINITIONS.filter((definition) => allowed.has(definition.function.name));
  const messages: ChatMessage[] = [
    { role: "system", content: buildSystemPrompt() },
    { role: "user", content: goal },
  ];
  let pendingCallId: string | null = null;

  return {
    model,
    async decide(previous): Promise<Decision> {
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
