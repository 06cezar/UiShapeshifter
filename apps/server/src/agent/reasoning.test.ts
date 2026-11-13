import { describe, expect, it } from "vitest";
import { parseReasoning } from "./reasoning";

describe("parseReasoning", () => {
  it("desparte rândul „Observ / Fac / Pentru că”", () => {
    expect(
      parseReasoning("Observ: Butonul Trimite are 32px. Fac: Îl măresc la 48px. Pentru că: Maria îl ratează des."),
    ).toEqual({
      observation: "Butonul Trimite are 32px.",
      decision: "Îl măresc la 48px.",
      reason: "Maria îl ratează des.",
    });
  });

  it("merge pe mai multe rânduri și fără diacritice", () => {
    expect(parseReasoning("observ: ecranul e gol\nFac: deschid Mesaje\nPentru ca: acolo e Ana")).toEqual({
      observation: "ecranul e gol",
      decision: "deschid Mesaje",
      reason: "acolo e Ana",
    });
  });

  it("păstrează textul ca decizie când formatul lipsește", () => {
    expect(parseReasoning("Mă uit la ecran.")).toEqual({ observation: "", decision: "Mă uit la ecran.", reason: "" });
  });

  it("acceptă conținut gol", () => {
    expect(parseReasoning(null)).toEqual({ observation: "", decision: "", reason: "" });
  });
});
