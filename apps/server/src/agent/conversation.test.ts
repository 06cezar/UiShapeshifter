import { beforeEach, describe, expect, it } from "vitest";
import { CONVERSATION_WINDOW_MS, MAX_TURNS, forgetConversations, recentTurns, recordTurn } from "./conversation";
import { userMessage } from "./system-prompt";

const turn = (goal: string, host = "a.ro", finishedAt = 1_000) => ({
  goal,
  summary: `gata: ${goal}`,
  host,
  finishedAt,
});

describe("memoria scurtă a conversației", () => {
  beforeEach(() => forgetConversations());

  it("dă cererile recente ale omului pe același site, cele mai vechi primele, cel mult MAX_TURNS", () => {
    for (let i = 1; i <= MAX_TURNS + 1; i++) recordTurn("maria", turn(`cererea ${i}`));
    recordTurn("maria", turn("pe alt site", "b.ro"));
    recordTurn("ion", turn("a lui Ion"));
    const goals = recentTurns("maria", "a.ro", 2_000).map((t) => t.goal);
    expect(goals).toEqual(["cererea 3", "cererea 4"]); // a 5-a, de pe b.ro, a scos-o pe cea mai veche din MAX_TURNS
    expect(recentTurns("maria", "b.ro", 2_000).map((t) => t.goal)).toEqual(["pe alt site"]);
  });

  it("o cerere mai veche decât fereastra nu mai e conversația de acum", () => {
    recordTurn("maria", turn("fă textul mai mare", "a.ro", 0));
    expect(recentTurns("maria", "a.ro", CONVERSATION_WINDOW_MS + 1)).toEqual([]);
  });

  it("mesajul pentru model pune conversația înainte, ca informație, și cererea de acum la final", () => {
    const page = { url: "https://a.ro/x?token=1", host: "a.ro", title: "A" };
    const text = userMessage("și mai mult", page, [turn("fă textul mai mare")]);
    expect(text).toContain("Conversația de până acum pe acest site, doar ca informație");
    expect(text).toContain("Omul a cerut: „fă textul mai mare”. Tu ai răspuns: „gata: fă textul mai mare”.");
    expect(text).toContain("Cererea de acum: și mai mult");
    expect(text).not.toContain("token=1");
    expect(userMessage("ascunde reclamele", page)).not.toContain("Conversația");
  });
});
