// Apelul către OpenRouter (API compatibil OpenAI, specs/01 „Decizii”). Cheia se citește doar aici, din env,
// și nu apare niciodată în loguri, în jurnal sau în mesajele de eroare.

const OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions";
const REQUEST_TIMEOUT_MS = 45_000;
// rețea, 429, 5xx: 2 reîncercări cu pauză de 1 s, apoi 3 s (specs/05, „Eșecuri”)
export const RETRY_DELAYS_MS: readonly number[] = [1000, 3000];
const APP_TITLE = "UI Shapeshifter";

export interface ChatToolCall {
  id: string;
  type: "function";
  function: { name: string; arguments: string };
}

export type ChatMessage =
  | { role: "system" | "user"; content: string }
  | { role: "assistant"; content: string | null; tool_calls?: ChatToolCall[] }
  | { role: "tool"; tool_call_id: string; content: string };

export interface ChatRequest {
  model: string;
  messages: ChatMessage[];
  tools: readonly unknown[];
  temperature: number;
}

export interface ChatReply {
  content: string | null;
  toolCalls: ChatToolCall[];
}

/** Eroare de la OpenRouter; `retryable` = rețea, 429 sau 5xx (A4 le reîncearcă). */
export class OpenRouterError extends Error {
  constructor(
    message: string,
    readonly status: number | null,
    readonly retryable: boolean,
  ) {
    super(message);
    this.name = "OpenRouterError";
  }
}

function isToolCall(value: unknown): value is ChatToolCall {
  const call = value as ChatToolCall | null;
  return (
    typeof call === "object" &&
    call !== null &&
    typeof call.id === "string" &&
    typeof call.function?.name === "string" &&
    typeof call.function?.arguments === "string"
  );
}

/** chatCompletion cu reîncercări pentru erorile trecătoare; celelalte (ex. cheie lipsă, 400) ies pe loc. */
export async function chatCompletionWithRetry(
  request: ChatRequest,
  delaysMs: readonly number[] = RETRY_DELAYS_MS,
): Promise<ChatReply> {
  for (let attempt = 0; ; attempt++) {
    try {
      return await chatCompletion(request);
    } catch (error) {
      const retryable = error instanceof OpenRouterError && error.retryable;
      if (!retryable || attempt >= delaysMs.length) throw error;
      console.warn(`openrouter: ${(error as Error).message}; reîncerc în ${delaysMs[attempt]} ms`);
      await new Promise((resolve) => setTimeout(resolve, delaysMs[attempt]));
    }
  }
}

export async function chatCompletion(request: ChatRequest): Promise<ChatReply> {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) throw new OpenRouterError("Lipsește OPENROUTER_API_KEY în apps/server/.env.", null, false);

  let response: Response;
  try {
    response = await fetch(OPENROUTER_URL, {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json", "X-Title": APP_TITLE },
      // provider.sort: OpenRouter alege furnizorul cel mai rapid acum; latența contează mai mult decât prețul în demo
      body: JSON.stringify({
        ...request,
        tool_choice: "auto",
        parallel_tool_calls: false,
        provider: { sort: "latency" },
      }),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
  } catch (error) {
    throw new OpenRouterError(`Rețea: ${(error as Error).name}`, null, true);
  }

  const body = (await response.json().catch(() => null)) as {
    choices?: Array<{ message?: { content?: unknown; tool_calls?: unknown } }>;
    error?: { message?: unknown };
  } | null;
  if (!response.ok || body?.error) {
    const detail = typeof body?.error?.message === "string" ? body.error.message : response.statusText;
    const retryable = response.status === 429 || response.status >= 500 || response.ok; // eroare în corp la 200
    throw new OpenRouterError(`OpenRouter ${response.status}: ${detail}`, response.status, retryable);
  }

  const message = body?.choices?.[0]?.message;
  if (!message) throw new OpenRouterError("Răspuns fără choices[0].message.", response.status, true);
  return {
    content: typeof message.content === "string" ? message.content : null,
    toolCalls: Array.isArray(message.tool_calls) ? message.tool_calls.filter(isToolCall) : [],
  };
}
