import { describe, expect, it } from "vitest";
import type { DomOp, RecipeRevision } from "@uishapeshifter/contracts";
import { recipeWithoutRequest, requestHistory } from "./undo-request";

const AT = "2026-11-14T00:00:00.000Z";

/** Istoricul cum îl scrie motorul de rețete: foaia și operațiile complete după fiecare revizie. */
function revision(n: number, runId: string | undefined, reason: string, css: string, ops?: DomOp[]): RecipeRevision {
  return { revision: n, css, ...(ops ? { ops } : {}), reason, ...(runId ? { runId } : {}), at: AT };
}

const HIDE_SHORTS = ".shorts { display: none !important; }";
const BIG_TEXT = "p { font-size: 22px !important; }";
const DARK = "body { background: #111 !important; }";

/** Trei cereri pe rând, fiecare cu `mode: "append"`. */
const HISTORY: RecipeRevision[] = [
  revision(1, "run-shorts", "ascunde Shorts", HIDE_SHORTS),
  revision(2, "run-text", "text mai mare", `${HIDE_SHORTS}\n${BIG_TEXT}`),
  revision(3, "run-dark", "fundal închis", `${HIDE_SHORTS}\n${BIG_TEXT}\n${DARK}`),
];

function cssWithout(history: RecipeRevision[], requestId: string): string {
  const result = recipeWithoutRequest(history, requestId);
  if (!result.ok) throw new Error(result.message);
  return result.recipe.css;
}

describe("requestHistory: lista cererilor din panou", () => {
  it("o cerere pe rulare, cu toate reviziile ei, în ordinea în care au fost făcute", () => {
    const history = [
      ...HISTORY.slice(0, 2),
      revision(3, "run-text", "text mai mare", `${HIDE_SHORTS}\n${BIG_TEXT}\na { font-size: 22px !important; }`),
    ];
    expect(requestHistory(history)).toEqual([
      { requestId: "run-shorts", reason: "ascunde Shorts", at: AT, revisions: [1] },
      { requestId: "run-text", reason: "text mai mare", at: AT, revisions: [2, 3] },
    ]);
  });

  it("o revizie fără rulare (preferințele de bază) e o cerere singură", () => {
    expect(requestHistory([revision(1, undefined, "font minim", BIG_TEXT)])[0]?.requestId).toBe("revizia-1");
  });
});

describe("recipeWithoutRequest: scoate o cerere, păstrează restul", () => {
  it("o cerere din mijloc: cele de dinainte și de după rămân", () => {
    const css = cssWithout(HISTORY, "run-text");
    expect(css).toContain(".shorts");
    expect(css).toContain("background");
    expect(css).not.toContain("font-size");
  });

  it("prima și ultima cerere", () => {
    expect(cssWithout(HISTORY, "run-shorts")).not.toContain(".shorts");
    expect(cssWithout(HISTORY, "run-shorts")).toContain("font-size");
    expect(cssWithout(HISTORY, "run-dark")).not.toContain("background");
  });

  it("o cerere cu mai multe revizii se scoate întreagă", () => {
    const history = [
      revision(1, "run-text", "text mai mare", BIG_TEXT),
      revision(2, "run-text", "text mai mare", `${BIG_TEXT}\na { font-size: 22px !important; }`),
      revision(3, "run-dark", "fundal închis", `${BIG_TEXT}\na { font-size: 22px !important; }\n${DARK}`),
    ];
    const css = cssWithout(history, "run-text");
    expect(css).not.toContain("font-size");
    expect(css).toContain("background");
  });

  it("o cerere care a rescris foaia (replace): scoasă, lasă foaia de dinainte plus ce a urmat", () => {
    const history = [
      revision(1, "run-shorts", "ascunde Shorts", HIDE_SHORTS),
      revision(2, "run-redo", "refă tot", BIG_TEXT),
      revision(3, "run-dark", "fundal închis", `${BIG_TEXT}\n${DARK}`),
    ];
    const css = cssWithout(history, "run-redo");
    expect(css).toContain(".shorts");
    expect(css).toContain("background");
    expect(css).not.toContain("font-size");
  });

  it("operațiile cererii pleacă, iar cele de după care țineau de elementul ei adăugat pleacă și ele", () => {
    const button: DomOp = {
      op: "insertHtml",
      id: "plata",
      html: "<button>Plătește</button>",
      at: { selector: "header", position: "prepend" },
    };
    const bind: DomOp = { op: "bind", from: "plata", to: "#pay" };
    const label: DomOp = { op: "setText", selector: '[data-shape="plata"] button', text: "Plătește factura" };
    const hideAds: DomOp = { op: "remove", selector: ".ads" };
    const history = [
      revision(1, "run-button", "buton Plătește", "", [button]),
      revision(2, "run-ads", "fără reclame", "", [button, hideAds]),
      revision(3, "run-label", "alt text pe buton", "", [button, hideAds, bind, label]),
    ];
    const result = recipeWithoutRequest(history, "run-button");
    expect(result.ok && result.recipe.ops).toEqual([hideAds]);
    expect(result.ok && result.recipe.droppedOps).toEqual([bind, label]);
  });

  it("foaia refăcută trece din nou prin validare (C5)", () => {
    const history = [
      revision(1, "run-a", "a", HIDE_SHORTS),
      revision(2, "run-b", "b", `${HIDE_SHORTS}\n.x { background: url(https://exemplu.test/a.png); }`),
    ];
    const result = recipeWithoutRequest(history, "run-a");
    expect(result.ok && result.recipe.css).toBe("");
    expect(result.ok && result.recipe.dropped.map((d) => d.reason)).toEqual(["url-function"]);
  });

  it("o cerere necunoscută sau ieșită din istoric nu se poate scoate singură", () => {
    expect(recipeWithoutRequest(HISTORY, "run-nimic").ok).toBe(false);
    // revizia 1 a ieșit din istoric: a 2-a conține și ce a cerut omul atunci, nu se mai poate despărți
    expect(recipeWithoutRequest(HISTORY.slice(1), "run-text").ok).toBe(false);
    expect(cssWithout(HISTORY.slice(1), "run-dark")).toContain("font-size");
  });
});
