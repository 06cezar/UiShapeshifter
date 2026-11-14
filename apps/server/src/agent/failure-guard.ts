// Regula generală pentru eșecuri (specs/05, „Eșecuri”): aceeași unealtă cu aceleași argumente nu se repetă după eșec,
// iar după RUN_LIMITS.maxToolRetries eșecuri la aceeași unealtă agentul schimbă planul sau închide.
// Garda nu oprește rularea: îi dă modelului un rezultat care spune ce să facă altfel, iar pasul apare în jurnal (roșu).

import { RUN_LIMITS, type ToolName, type ToolResult } from "@uishapeshifter/contracts";

// unelte care nu pot „eșua repetat” în sensul regulii: închiderea și mesajele către om
const NEVER_BLOCKED: ReadonlySet<ToolName> = new Set(["finish", "say"]);

/** Cheie stabilă pentru „aceleași argumente”: JSON cu cheile sortate. */
export function callKey(name: ToolName, args: unknown): string {
  const stable = (value: unknown): unknown =>
    Array.isArray(value)
      ? value.map(stable)
      : value && typeof value === "object"
        ? Object.fromEntries(
            Object.entries(value as Record<string, unknown>)
              .sort(([a], [b]) => a.localeCompare(b))
              .map(([key, inner]) => [key, stable(inner)]),
          )
        : value;
  return `${name}:${JSON.stringify(stable(args ?? {}))}`;
}

function counts(result: ToolResult): boolean {
  // anularea de către om nu e un eșec al agentului
  return !result.ok && result.error.code !== "USER_CANCELLED";
}

export interface FailureGuard {
  /** null = unealta poate rula; altfel rezultatul dat modelului în locul ei. */
  check(name: ToolName, args: unknown): ToolResult | null;
  record(name: ToolName, args: unknown, result: ToolResult): void;
}

export function createFailureGuard(maxRetries: number = RUN_LIMITS.maxToolRetries): FailureGuard {
  const failedCalls = new Set<string>();
  const failuresByTool = new Map<ToolName, number>();

  return {
    check(name, args) {
      if (NEVER_BLOCKED.has(name)) return null;
      if (failedCalls.has(callKey(name, args))) {
        return {
          ok: false,
          error: {
            code: "INVALID_ARGS",
            message:
              `Ai mai încercat exact asta (${name}, aceleași argumente) și n-a mers; nu am trimis-o din nou. ` +
              "Alege alt selector sau alte valori, ori alt plan.",
          },
        };
      }
      const failures = failuresByTool.get(name) ?? 0;
      if (failures >= maxRetries) {
        return {
          ok: false,
          error: {
            code: "INVALID_ARGS",
            message:
              `${name} a eșuat de ${failures} ori în rularea asta; nu o mai trimit. ` +
              "Schimbă planul (altă unealtă), întreabă omul, sau închide cu finish(success: false) și spune de ce.",
          },
        };
      }
      return null;
    },

    record(name, args, result) {
      if (NEVER_BLOCKED.has(name) || !counts(result)) return;
      // TIMEOUT e trecător (pagina grea, tab în fundal): același apel poate merge la a doua încercare, deci nu-l
      // blocăm ca „deja încercat”; se numără totuși la eșecurile uneltei.
      if (!result.ok && result.error.code !== "TIMEOUT") failedCalls.add(callKey(name, args));
      failuresByTool.set(name, (failuresByTool.get(name) ?? 0) + 1);
    },
  };
}
