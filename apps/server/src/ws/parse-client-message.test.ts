import { describe, expect, it } from "vitest";
import { parseClientMessage } from "./parse-client-message";

const parse = (value: unknown) => parseClientMessage(JSON.stringify(value));

describe("parseClientMessage", () => {
  it("acceptă mesajele din specs/06", () => {
    expect(parse({ type: "hello", userId: "maria", sessionId: "s1" })).toEqual({
      type: "hello",
      userId: "maria",
      sessionId: "s1",
    });
    expect(parse({ type: "user_message", text: " fă textul mai mare ", source: "voice" })).toEqual({
      type: "user_message",
      text: "fă textul mai mare",
      source: "voice",
    });
    expect(parse({ type: "tool_result", callId: "c1", result: { ok: true, data: { shown: true } } })?.type).toBe(
      "tool_result",
    );
    expect(
      parse({ type: "tool_result", callId: "c1", result: { ok: false, error: { code: "NOT_VISIBLE", message: "x" } } })
        ?.type,
    ).toBe("tool_result");
    expect(parse({ type: "signals", signals: [{ kind: "zoom", ts: "t", scale: 2 }] })?.type).toBe("signals");
    expect(parse({ type: "cancel_run", runId: "run-1" })).toEqual({ type: "cancel_run", runId: "run-1" });
  });

  it("refuză ce nu respectă forma", () => {
    expect(parseClientMessage("nu e json")).toBeNull();
    expect(parse(["hello"])).toBeNull();
    expect(parse({ type: "hello", userId: "maria" })).toBeNull();
    expect(parse({ type: "user_message", text: "   ", source: "text" })).toBeNull();
    expect(parse({ type: "user_message", text: "salut", source: "telepatie" })).toBeNull();
    expect(parse({ type: "tool_result", callId: "c1", result: { ok: true } })).toBeNull();
    expect(parse({ type: "tool_result", callId: "c1", result: { ok: false } })).toBeNull();
    expect(parse({ type: "signals", signals: [42] })).toBeNull();
    expect(parse({ type: "necunoscut" })).toBeNull();
  });
});
