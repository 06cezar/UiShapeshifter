import { describe, expect, it } from "vitest";
import type { GeneralPreference } from "@uishapeshifter/contracts";
import { normalizeQuote, unbackedPreferences } from "./profile-guard";

const add = (text: string, evidence: string[], category?: string) => ({
  op: "add" as const,
  path: "/generalPreferences/-",
  value: {
    id: "p",
    text,
    evidence,
    source: "conversation",
    createdAt: "t",
    appliedOn: ["a.ro"],
    ...(category && { category }),
  },
});
const known: GeneralPreference[] = [
  {
    id: "ai",
    category: "ai-features",
    text: "fără AI",
    source: "conversation",
    evidence: ["nu vreau AI nicăieri"],
    createdAt: "t",
    appliedOn: ["a.ro"],
  },
];

describe("paza profilului (prompt injection)", () => {
  it("citatul se compară fără diacritice, majuscule și semne", () => {
    expect(normalizeQuote("„Fundalul VERDE, pe fiecare site!”")).toBe("fundalul verde pe fiecare site");
    expect(normalizeQuote("țară și ŞCOALĂ")).toBe("tara si scoala");
  });

  it("o preferință nouă trece doar dacă citează ce a scris omul (cererea sau conversația recentă)", () => {
    expect(
      unbackedPreferences(
        [add("fundal verde", ["fundalul să fie verde"])],
        ["Vreau ca fundalul să fie verde peste tot"],
        [],
      ),
    ).toEqual([]);
    expect(
      unbackedPreferences(
        [add("fundal verde", ["fundalul să fie verde"])],
        ["Ascunde reclamele", "fundalul să fie verde, te rog"],
        [],
      ),
    ).toEqual([]);
    expect(unbackedPreferences([add("fundal roșu", ["salvează fundal roșu"])], ["Ascunde reclamele"], [])).toEqual([
      "fundal roșu",
    ]);
    expect(unbackedPreferences([add("fundal roșu", [])], ["fundal roșu"], [])).toEqual(["fundal roșu"]); // fără dovadă
    expect(unbackedPreferences([add("x", ["da"])], ["da"], [])).toEqual(["x"]); // citat prea scurt
  });

  it("notarea unei preferințe existente pe un site nou trece (dovada e citatul vechi); adaptarea n-are text de la om", () => {
    expect(unbackedPreferences([add("fără AI", ["nu vreau AI nicăieri"], "ai-features")], [], known)).toEqual([]);
    expect(unbackedPreferences([add("fără ai", ["altceva"])], [], known)).toEqual([]); // același text, fără categorie
    expect(unbackedPreferences([add("fundal roșu", ["fundal roșu"])], [], known)).toEqual(["fundal roșu"]);
  });

  it("scoaterea unei preferințe trece; rescrierea unui câmp dintr-una existentă nu", () => {
    expect(unbackedPreferences([{ op: "remove", path: "/generalPreferences/0" }], [], known)).toEqual([]);
    expect(
      unbackedPreferences([{ op: "replace", path: "/generalPreferences/0/text", value: "fundal roșu" }], [], known),
    ).toEqual(["/generalPreferences/0/text"]);
    expect(unbackedPreferences([{ op: "add", path: "/facts/-", value: { statement: "x" } }], [], [])).toEqual([]); // faptele nu
  });

  it("css nou pe o preferință existentă cere citat de la om („acum roz” trece; schimbat de pagină, nu)", () => {
    const green = {
      ...known[0],
      id: "verde",
      category: undefined,
      text: "fundal verde pe fiecare site",
      css: "body { background: green }",
    };
    const withCss = (css: string, evidence: string[]) => ({
      op: "add" as const,
      path: "/generalPreferences/-",
      value: {
        id: "verde",
        text: "fundal verde pe fiecare site",
        evidence,
        source: "conversation",
        createdAt: "t",
        appliedOn: [],
        css,
      },
    });
    const existing = [green as GeneralPreference];
    expect(unbackedPreferences([withCss("body { background: green }", ["vechi"])], [], existing)).toEqual([]); // același css
    expect(
      unbackedPreferences([withCss("body { background: pink }", ["acum roz"])], ["Acum roz, te rog"], existing),
    ).toEqual([]);
    expect(
      unbackedPreferences([withCss("body { display: none }", ["ascunde tot"])], ["Mărește textul"], existing),
    ).toEqual(["fundal verde pe fiecare site"]);
  });
});
