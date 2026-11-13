// Decider-ul OpenRouter cu fetch înlocuit: fără rețea, fără cheie reală.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { UISnapshot } from "@uishapeshifter/contracts";
import { createOpenRouterDecider } from "./openrouter-decider";

type Sent = { messages: Array<{ role: string; content?: string | null; tool_call_id?: string }>; tools: unknown[] };

function reply(content: string | null, call?: { name: string; arguments: string }) {
  const message = call
    ? { content, tool_calls: [{ id: `call-${call.name}`, type: "function", function: call }] }
    : { content };
  return new Response(JSON.stringify({ choices: [{ message }] }), { status: 200 });
}

let sent: Sent[];
let replies: Response[];

beforeEach(() => {
  process.env.OPENROUTER_API_KEY = "cheie-de-test";
  sent = [];
  replies = [];
  vi.stubGlobal("fetch", async (_url: string, init: RequestInit) => {
    sent.push(JSON.parse(String(init.body)) as Sent);
    const next = replies.shift();
    if (!next) throw new Error("niciun răspuns pregătit");
    return next;
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

const snapshot: UISnapshot = {
  route: "home",
  configRevision: 2,
  viewport: { width: 400, height: 800 },
  openOverlays: [],
  takenAt: "",
  elements: [
    {
      id: "nav.messages",
      role: "button",
      label: "Mesaje",
      rect: { x: 0, y: 0, width: 80.4, height: 60 },
      visible: true,
      inViewport: true,
      interactive: true,
      fontPx: 16,
    },
  ],
};

describe("createOpenRouterDecider", () => {
  it("dă tool call-ul modelului, apoi îi trimite rezultatul compactat", async () => {
    const decider = createOpenRouterDecider("Fă textul mai mare");
    replies.push(reply("Observ: x. Fac: snapshot. Pentru că: y.", { name: "get_ui_snapshot", arguments: "{}" }));
    expect(await decider.decide(null)).toEqual({
      kind: "tool",
      name: "get_ui_snapshot",
      args: {},
      content: "Observ: x. Fac: snapshot. Pentru că: y.",
    });
    expect(sent[0].messages.map((m) => m.role)).toEqual(["system", "user"]);
    expect(sent[0].tools).toHaveLength(4);

    replies.push(
      reply("Observ: 16px.", {
        name: "patch_config",
        arguments: '{"ops":[{"op":"replace","path":"/theme/baseFontPx","value":18}],"reason":"mai mare"}',
      }),
    );
    const second = await decider.decide({ name: "get_ui_snapshot", args: {}, result: { ok: true, data: snapshot } });
    expect(second).toMatchObject({ kind: "tool", name: "patch_config" });

    const toolMessage = sent[1].messages.at(-1)!;
    expect(toolMessage).toMatchObject({ role: "tool", tool_call_id: "call-get_ui_snapshot" });
    expect(JSON.parse(toolMessage.content!)).toMatchObject({
      ok: true,
      data: { route: "home", elements: [{ id: "nav.messages", size: "80x60", fontPx: 16 }] },
    });
  });

  it("fără tool call: textul modelului e răspunsul final", async () => {
    const decider = createOpenRouterDecider("Salut");
    replies.push(reply("Bună! Cu ce te ajut?"));
    expect(await decider.decide(null)).toEqual({ kind: "text", content: "Bună! Cu ce te ajut?" });
  });

  it("un tool call stricat se întoarce la model ca INVALID_ARGS, fără să plece spre interfață", async () => {
    const decider = createOpenRouterDecider("Fă textul mai mare");
    replies.push(reply(null, { name: "delete_everything", arguments: "{}" }));
    replies.push(reply(null, { name: "get_ui_snapshot", arguments: "{}" }));
    expect(await decider.decide(null)).toMatchObject({ kind: "tool", name: "get_ui_snapshot" });
    const feedback = sent[1].messages.at(-1)!;
    expect(feedback.role).toBe("tool");
    expect(feedback.content).toContain("INVALID_ARGS");
  });

  it("reîncearcă de 2 ori la 429 / 5xx, apoi renunță fără să pună cheia în mesaj", async () => {
    const decider = createOpenRouterDecider("x", { retryDelaysMs: [0, 0] });
    const rateLimited = () => new Response(JSON.stringify({ error: { message: "Rate limit" } }), { status: 429 });
    replies.push(rateLimited(), rateLimited(), rateLimited());
    const error = await decider.decide(null).catch((e: Error) => e);
    expect(sent).toHaveLength(3);
    expect(error).toBeInstanceOf(Error);
    expect((error as Error).message).toContain("429");
    expect((error as Error).message).not.toContain("cheie-de-test");
  });

  it("după o eroare trecătoare, a doua încercare reușește", async () => {
    const decider = createOpenRouterDecider("x", { retryDelaysMs: [0, 0] });
    replies.push(new Response("eroare", { status: 502 }), reply("Gata."));
    expect(await decider.decide(null)).toEqual({ kind: "text", content: "Gata." });
    expect(sent).toHaveLength(2);
  });

  it("nu reîncearcă erorile care nu trec singure (400)", async () => {
    const decider = createOpenRouterDecider("x", { retryDelaysMs: [0, 0] });
    replies.push(new Response(JSON.stringify({ error: { message: "bad request" } }), { status: 400 }));
    await expect(decider.decide(null)).rejects.toThrow("400");
    expect(sent).toHaveLength(1);
  });
});
