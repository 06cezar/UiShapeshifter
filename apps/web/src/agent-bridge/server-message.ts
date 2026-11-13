// Mesajele de pe server vin din afară: le verificăm forma înainte de folosire (ServerMessage, specs/06).
// Un mesaj care nu se potrivește se ignoră (cu avertisment), nu strică puntea.

import { TOOL_RUNS_ON } from "@uishapeshifter/contracts";
import type { AgentStep, MascotState, RunOrigin, ServerMessage, ToolArgs, ToolName } from "@uishapeshifter/contracts";

const RUN_ORIGINS: Record<RunOrigin, true> = { user: true, adaptation: true, onboarding: true };
const MASCOT_STATES: Record<MascotState, true> = {
  idle: true,
  listening: true,
  thinking: true,
  speaking: true,
  pointing: true,
  happy: true,
  confused: true,
};

type Json = Record<string, unknown>;

export function parseServerMessage(raw: string): ServerMessage | null {
  let message: unknown;
  try {
    message = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!isObject(message)) return null;

  switch (message.type) {
    case "run_started":
      return isText(message.runId) && typeof message.goal === "string" && isOneOf(message.origin, RUN_ORIGINS)
        ? { type: "run_started", runId: message.runId, goal: message.goal, origin: message.origin }
        : null;
    case "step":
      // conținutul pasului îl afișează panoul (D); aici doar că e un pas al unei rulări
      return isObject(message.step) && isText(message.step.runId) && typeof message.step.index === "number"
        ? { type: "step", step: message.step as unknown as AgentStep }
        : null;
    case "tool_call":
      return isText(message.runId) && isText(message.callId) && isToolName(message.name)
        ? // argumentele vin de la model: le verifică handler-ul uneltei, nu aici
          {
            type: "tool_call",
            runId: message.runId,
            callId: message.callId,
            name: message.name,
            args: message.args as ToolArgs[ToolName],
          }
        : null;
    case "agent_message":
      return typeof message.text === "string" &&
        isOneOf(message.mascot, MASCOT_STATES) &&
        (message.runId === undefined || isText(message.runId))
        ? { type: "agent_message", runId: message.runId, text: message.text, mascot: message.mascot }
        : null;
    case "run_finished":
      return isText(message.runId) && typeof message.success === "boolean" && typeof message.summary === "string"
        ? { type: "run_finished", runId: message.runId, success: message.success, summary: message.summary }
        : null;
    case "error":
      return typeof message.message === "string" ? { type: "error", message: message.message } : null;
    default:
      return null;
  }
}

function isObject(value: unknown): value is Json {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isText(value: unknown): value is string {
  return typeof value === "string" && value.length > 0;
}

function isOneOf<T extends string>(value: unknown, allowed: Record<T, true>): value is T {
  return typeof value === "string" && Object.hasOwn(allowed, value);
}

function isToolName(value: unknown): value is ToolName {
  return typeof value === "string" && Object.hasOwn(TOOL_RUNS_ON, value);
}
