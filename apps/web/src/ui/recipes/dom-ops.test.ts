// Operațiile de structură (B6): validarea, aplicarea și anularea exactă pentru remove, move, wrap, setText, setAttr.

import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { DOM_OP_LIMITS, type DomOp } from "@uishapeshifter/contracts";
import { checkOp, checkOps, createDomOpsApplier, HIDDEN_ATTR, HIDDEN_STYLE_ID, MARKER_TEXT } from "./dom-ops";

// O pagină ca site-ul de test: antet, căutare, meniu, reclame, conținut.
const PAGE = `
<header id="top"><a class="logo" href="/">Logo</a><nav id="menu"><a href="/a">A</a><a href="/b">B</a></nav></header>
<main id="main">
  <form class="search" role="search"><input type="search" placeholder="Caută" aria-label="Caută pe site"></form>
  <div class="ad">Reclamă 1</div>
  <section id="news"><h2 id="news-title">Noutăți</h2><p>text</p></section>
  <div class="ad">Reclamă 2</div>
  <aside id="recent">Recente</aside><aside id="saved">Salvate</aside>
</main>
<div id="uishapeshifter-root"></div>`;

let original: string;
beforeEach(() => {
  document.body.innerHTML = PAGE;
  original = document.body.innerHTML;
});
afterEach(() => {
  document.body.innerHTML = "";
  document.getElementById(HIDDEN_STYLE_ID)?.remove();
});

const $ = (selector: string) => document.querySelector(selector)!;

describe("aplicare și anulare exactă", () => {
  test("remove ascunde (atribut + display:none) TOATE potrivirile, fără să scoată nodurile", () => {
    const applier = createDomOpsApplier();
    expect(applier.sync([{ op: "remove", selector: ".ad" }])).toEqual([{ ok: true }]);
    const ads = document.querySelectorAll(".ad");
    expect(ads).toHaveLength(2);
    ads.forEach((ad) => expect(ad.hasAttribute(HIDDEN_ATTR)).toBe(true));
    expect(document.getElementById(HIDDEN_STYLE_ID)?.textContent).toContain("display: none !important");
    expect(getComputedStyle(ads[0]!).display).toBe("none");
    applier.undoAll();
    expect(document.body.innerHTML).toBe(original);
  });

  test("move mută real, cu un marcaj pe locul vechi; anularea îl pune exact înapoi", () => {
    const applier = createDomOpsApplier();
    const search = $("[role='search']");
    applier.sync([{ op: "move", selector: "[role='search']", to: { selector: "body", position: "prepend" } }]);
    expect(document.body.firstElementChild).toBe(search);
    expect(document.body.innerHTML).toContain(`<!--${MARKER_TEXT}-->`);
    applier.undoAll();
    expect(document.body.innerHTML).toBe(original);
    expect($("[role='search']")).toBe(search); // același nod, nu o copie
  });

  test.each([
    ["before", (t: Element, el: Element) => el.nextElementSibling === t],
    ["after", (t: Element, el: Element) => t.nextElementSibling === el],
    ["prepend", (t: Element, el: Element) => t.firstElementChild === el],
    ["append", (t: Element, el: Element) => t.lastElementChild === el],
  ] as const)("move %s", (position, placed) => {
    const applier = createDomOpsApplier();
    applier.sync([{ op: "move", selector: "#recent", to: { selector: "#news", position } }]);
    expect(placed($("#news"), $("#recent"))).toBe(true);
    applier.undoAll();
    expect(document.body.innerHTML).toBe(original);
  });

  test("wrap pune elementele într-un container cu data-shape, pe locul primului; anularea îl scoate", () => {
    const applier = createDomOpsApplier();
    applier.sync([{ op: "wrap", selectors: ["#recent", "#saved"], id: "side-group", tag: "section" }]);
    const container = $("[data-shape='side-group']");
    expect(container.tagName).toBe("SECTION");
    expect([...container.children].map((c) => c.id)).toEqual(["recent", "saved"]);
    expect(container.parentElement).toBe($("#main"));
    applier.undoAll();
    expect(document.body.innerHTML).toBe(original);
  });

  test("setText schimbă textul pe toate potrivirile; anularea pune nodurile vechi", () => {
    const applier = createDomOpsApplier();
    const oldText = $("#news-title").firstChild;
    applier.sync([{ op: "setText", selector: "#news-title", text: "Ce e nou azi" }]);
    expect($("#news-title").textContent).toBe("Ce e nou azi");
    applier.undoAll();
    expect($("#news-title").firstChild).toBe(oldText);
    expect(document.body.innerHTML).toBe(original);
  });

  test("setText pe un element care are alte elemente înăuntru: INVALID, nimic schimbat", () => {
    const applier = createDomOpsApplier();
    const [result] = applier.sync([{ op: "setText", selector: "#news", text: "x" }]);
    expect(result).toMatchObject({ ok: false, reason: "INVALID" });
    expect(document.body.innerHTML).toBe(original);
  });

  test("setAttr schimbă și reface valoarea veche, sau scoate atributul care lipsea", () => {
    const applier = createDomOpsApplier();
    applier.sync([
      { op: "setAttr", selector: "input[type='search']", name: "placeholder", value: "Ce cauți?" },
      { op: "setAttr", selector: "#menu", name: "aria-label", value: "Meniu principal" },
    ]);
    expect($("input").getAttribute("placeholder")).toBe("Ce cauți?");
    expect($("#menu").getAttribute("aria-label")).toBe("Meniu principal");
    applier.undoAll();
    expect(document.body.innerHTML).toBe(original);
  });

  test("un lanț move → wrap → setText → remove se anulează în ordine inversă, exact", () => {
    const applier = createDomOpsApplier();
    const ops: DomOp[] = [
      { op: "move", selector: "#saved", to: { selector: "#news", position: "before" } },
      { op: "wrap", selectors: ["#saved", "#news"], id: "grup" },
      { op: "setText", selector: "#news-title", text: "Azi" },
      { op: "remove", selector: ".ad" },
    ];
    expect(applier.sync(ops).every((r) => r.ok)).toBe(true);
    applier.undoAll();
    expect(document.body.innerHTML).toBe(original);
  });

  test("sync de două ori nu dublează nimic (anulează tot, aplică tot)", () => {
    const applier = createDomOpsApplier();
    const ops: DomOp[] = [
      { op: "move", selector: "[role='search']", to: { selector: "body", position: "prepend" } },
      { op: "wrap", selectors: ["#recent", "#saved"], id: "side-group" },
    ];
    applier.sync(ops);
    const once = document.body.innerHTML;
    applier.sync(ops);
    expect(document.body.innerHTML).toBe(once);
    expect(document.querySelectorAll("[data-shape='side-group']")).toHaveLength(1);
  });
});

describe("motivele pentru skipped la aplicare", () => {
  const outcome = (op: DomOp) => createDomOpsApplier().sync([op])[0];

  test("SELECTOR_NOT_FOUND, SELECTOR_AMBIGUOUS, TARGET_NOT_FOUND", () => {
    expect(outcome({ op: "remove", selector: "#nu-exista" })).toMatchObject({ reason: "SELECTOR_NOT_FOUND" });
    expect(outcome({ op: "move", selector: ".ad", to: { selector: "body", position: "prepend" } })).toMatchObject({
      reason: "SELECTOR_AMBIGUOUS",
    });
    expect(outcome({ op: "move", selector: "#recent", to: { selector: "#nu", position: "after" } })).toMatchObject({
      reason: "TARGET_NOT_FOUND",
    });
    expect(outcome({ op: "move", selector: "#recent", to: { selector: "aside", position: "after" } })).toMatchObject({
      reason: "SELECTOR_AMBIGUOUS",
    });
    expect(outcome({ op: "wrap", selectors: ["#recent", ".ad"], id: "g" })).toMatchObject({
      reason: "SELECTOR_AMBIGUOUS",
    });
    expect(document.body.innerHTML).toBe(original);
  });

  test("interfața noastră nu se atinge: potrivirile din gazda uishapeshifter sunt ignorate", () => {
    expect(outcome({ op: "remove", selector: "#uishapeshifter-root" })).toMatchObject({ reason: "SELECTOR_NOT_FOUND" });
    expect(outcome({ op: "move", selector: "#news", to: { selector: "#news", position: "after" } })).toMatchObject({
      reason: "INVALID",
    });
  });
});

describe("checkOp și checkOps (înainte de aplicare)", () => {
  test("operațiile bune trec, cu forma curată", () => {
    expect(checkOp({ op: "remove", selector: ".ad", extra: 1 }, document)).toEqual({
      ok: true,
      op: { op: "remove", selector: ".ad" },
    });
    expect(checkOp({ op: "wrap", selectors: ["#a"], id: "side-1", tag: "nav" }, document)).toMatchObject({ ok: true });
  });

  test.each([
    [{ op: "insertHtml", id: "x", html: "<p>", at: { selector: "main", position: "append" } }, "vine în B3"],
    [{ op: "bind", from: "x", to: "a" }, "vine în B3"],
    [{ op: "inject", id: "x", component: {}, at: { selector: "main", position: "append" } }, "vine în B3"],
    [{ op: "dance" }, "nu există"],
    [null, "obiect"],
    [{ op: "remove", selector: "[[nu" }, "nu e valid"],
    [{ op: "remove", selector: "#uishapeshifter-root" }, "interfața extensiei"],
    [{ op: "remove", selector: "[data-agent-id='x']" }, "interfața extensiei"],
    [{ op: "move", selector: "#a", to: { selector: "#b", position: "middle" } }, "position"],
    [{ op: "wrap", selectors: [], id: "g" }, "selectors"],
    [{ op: "wrap", selectors: ["#a"], id: "Grup Mare" }, "litere mici"],
    [{ op: "wrap", selectors: ["#a"], id: "x".repeat(DOM_OP_LIMITS.maxShapeIdChars + 1) }, "litere mici"],
    [{ op: "wrap", selectors: ["#a"], id: "g", tag: "table" }, "tag"],
    [{ op: "setText", selector: "#a", text: "x".repeat(DOM_OP_LIMITS.maxTextChars + 1) }, "cel mult"],
    [{ op: "setAttr", selector: "#a", name: "href", value: "/x" }, "doar"],
    [{ op: "setAttr", selector: "#a", name: "onclick", value: "x" }, "doar"],
  ])("INVALID: %j", (raw, message) => {
    const check = checkOp(raw, document);
    expect(check.ok).toBe(false);
    if (!check.ok) {
      expect(check.reason).toBe("INVALID");
      expect(check.message).toContain(message);
    }
  });

  test("ALREADY_APPLIED pentru o operație deja în rețetă (ordinea câmpurilor nu contează) sau repetată în apel", () => {
    const existing: DomOp[] = [{ op: "move", selector: "#a", to: { selector: "body", position: "prepend" } }];
    const { accepted, skipped } = checkOps(
      [
        { to: { position: "prepend", selector: "body" }, selector: "#a", op: "move" },
        { op: "remove", selector: ".ad" },
        { op: "remove", selector: ".ad" },
      ],
      existing,
      document,
    );
    expect(accepted.map((a) => a.index)).toEqual([1]);
    expect(skipped.map((s) => [s.index, s.reason])).toEqual([
      [0, "ALREADY_APPLIED"],
      [2, "ALREADY_APPLIED"],
    ]);
  });

  test("un id de wrap deja folosit (în rețetă sau pe pagină) e INVALID", () => {
    document.body.insertAdjacentHTML("beforeend", `<div data-shape="pe-pagina"></div>`);
    const { skipped } = checkOps(
      [
        { op: "wrap", selectors: ["#recent"], id: "din-reteta" },
        { op: "wrap", selectors: ["#saved"], id: "pe-pagina" },
      ],
      [{ op: "wrap", selectors: ["#news"], id: "din-reteta" }],
      document,
    );
    expect(skipped.map((s) => s.reason)).toEqual(["INVALID", "INVALID"]);
  });
});
