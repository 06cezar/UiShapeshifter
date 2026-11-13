import { describe, expect, test } from "vitest";
import type { AgentStep, ServerMessage } from "@uishapeshifter/contracts";
import { CHAT_TEXT, MAX_INPUT_CHARS, MAX_MESSAGES, chatReducer, initialChatState, sendableText } from "./chat-state";

const run = (message: ServerMessage) => ({ type: "server", message }) as const;

function step(decision: string, observation = ""): AgentStep {
  return { runId: "r1", index: 0, ts: "2026-11-13T20:00:00Z", observation, decision, reason: "" };
}

describe("trimiterea", () => {
  test("mesajul omului intră în istoric și agentul apare ca „lucrează”", () => {
    const state = chatReducer(initialChatState(), { type: "user_sent", text: "ascunde Shorts" });
    expect(state.messages).toMatchObject([{ role: "user", text: "ascunde Shorts", isError: false }]);
    expect(state.working).toBe(true);
    expect(state.activity).toBe(CHAT_TEXT.thinking);
  });

  test("textul gol, doar spații sau prea lung nu se trimite", () => {
    expect(sendableText("   ")).toBeNull();
    expect(sendableText("a".repeat(MAX_INPUT_CHARS + 1))).toBeNull();
    expect(sendableText("  ascunde  ")).toBe("ascunde");
    expect(sendableText("a".repeat(MAX_INPUT_CHARS))).not.toBeNull();
  });
});

describe("răspunsurile serverului", () => {
  test("pașii actualizează rândul de activitate, scurt și pe un singur rând", () => {
    let state = chatReducer(initialChatState(), run({ type: "run_started", runId: "r1", goal: "g", origin: "user" }));
    expect(state.working).toBe(true);
    state = chatReducer(state, run({ type: "step", step: step("Ascund   raftul\nShorts", "x") }));
    expect(state.activity).toBe("Ascund raftul Shorts");
    state = chatReducer(state, run({ type: "step", step: step("a".repeat(200)) }));
    expect(state.activity).toHaveLength(80);
    expect(state.activity?.endsWith("…")).toBe(true);
  });

  test("agent_message devine o bulă a agentului", () => {
    const state = chatReducer(
      initialChatState(),
      run({ type: "agent_message", runId: "r1", text: " Am ascuns Shorts. ", mascot: "happy" }),
    );
    expect(state.messages).toMatchObject([{ role: "agent", text: "Am ascuns Shorts.", isError: false }]);
  });

  test("run_finished oprește lucrul și pune rezumatul; la eșec bula e de eroare", () => {
    const working = chatReducer(initialChatState(), { type: "user_sent", text: "x" });
    const ok = chatReducer(working, run({ type: "run_finished", runId: "r1", success: true, summary: "Gata." }));
    expect(ok.working).toBe(false);
    expect(ok.activity).toBeNull();
    expect(ok.messages.at(-1)).toMatchObject({ text: "Gata.", isError: false });
    const failed = chatReducer(
      working,
      run({ type: "run_finished", runId: "r1", success: false, summary: "N-am găsit." }),
    );
    expect(failed.messages.at(-1)).toMatchObject({ text: "N-am găsit.", isError: true });
  });

  test("același text de două ori la rând apare o singură dată (say și rezumatul final)", () => {
    let state = chatReducer(initialChatState(), run({ type: "agent_message", text: "Gata.", mascot: "happy" }));
    state = chatReducer(state, run({ type: "run_finished", runId: "r1", success: true, summary: "Gata." }));
    expect(state.messages).toHaveLength(1);
  });

  test("dacă a doua oară e o eroare, bula unică devine de eroare", () => {
    let state = chatReducer(
      initialChatState(),
      run({ type: "agent_message", text: "N-am putut.", mascot: "confused" }),
    );
    state = chatReducer(state, run({ type: "run_finished", runId: "r1", success: false, summary: "N-am putut." }));
    expect(state.messages).toHaveLength(1);
    expect(state.messages[0]?.isError).toBe(true);
  });

  test("o eroare a serverului oprește lucrul și se vede ca eroare", () => {
    const working = chatReducer(initialChatState(), { type: "user_sent", text: "x" });
    const state = chatReducer(working, run({ type: "error", message: "model indisponibil" }));
    expect(state.working).toBe(false);
    expect(state.messages.at(-1)).toMatchObject({ isError: true, text: `${CHAT_TEXT.errorPrefix} model indisponibil` });
  });

  test("tool_call nu atinge chatul", () => {
    const before = initialChatState();
    const state = chatReducer(
      before,
      run({ type: "tool_call", runId: "r1", callId: "c1", name: "say", args: { message: "x" } }),
    );
    expect(state).toBe(before);
  });
});

describe("legătura cu serverul", () => {
  test("dacă se rupe în timpul lucrului, nu mai așteptăm și spunem asta", () => {
    const working = chatReducer(initialChatState(), { type: "user_sent", text: "x" });
    const state = chatReducer(working, { type: "link", status: "closed" });
    expect(state.working).toBe(false);
    expect(state.messages.at(-1)).toMatchObject({ text: CHAT_TEXT.linkLost, isError: true });
  });

  test("dacă se rupe cât nu lucra, doar își notează starea", () => {
    const state = chatReducer(initialChatState(), { type: "link", status: "closed" });
    expect(state.link).toBe("closed");
    expect(state.messages).toHaveLength(0);
  });
});

describe("istoricul", () => {
  test("păstrează doar ultimele MAX_MESSAGES", () => {
    let state = initialChatState();
    for (let i = 0; i < MAX_MESSAGES + 5; i++) state = chatReducer(state, { type: "user_sent", text: `m${i}` });
    expect(state.messages).toHaveLength(MAX_MESSAGES);
    expect(state.messages[0]?.text).toBe("m5");
  });
});

describe("deschis / închis", () => {
  test("open și close schimbă doar starea panoului", () => {
    const opened = chatReducer(initialChatState(), { type: "open" });
    expect(opened.open).toBe(true);
    expect(chatReducer(opened, { type: "close" }).open).toBe(false);
  });
});
