import { describe, expect, it } from "vitest";
import { DOM_OP_LIMITS, type HtmlDropped } from "@uishapeshifter/contracts";
import { validateHtml } from "./html";

function reasonsOf(html: string): HtmlDropped["reason"][] {
  return validateHtml(html).dropped.map((d) => d.reason);
}

describe("validateHtml: ce trece (lista din contract, dom-ops.ts)", () => {
  it("o placă obișnuită trece neschimbată", () => {
    const html =
      '<div class="placa" role="region" aria-label="Factura"><h2>Factura</h2>' +
      "<p>Scadentă pe <strong>20 noiembrie</strong></p>" +
      '<a href="/plata" title="Plătește">Plătește</a><button class="mare">Plătește acum</button></div>';
    expect(validateHtml(html)).toEqual({ html, dropped: [], rejected: false });
  });

  it("linkuri permise: cale din site, ancoră, https", () => {
    expect(validateHtml('<a href="/cos">Coș</a><a href="#sus">Sus</a><a href="https://exemplu.test">E</a>')).toEqual(
      expect.objectContaining({ dropped: [], rejected: false }),
    );
  });

  it("întoarce forma normalizată de parser (pe ea s-a făcut verificarea)", () => {
    expect(validateHtml("<p>neînchis").html).toBe("<p>neînchis</p>");
  });
});

describe("validateHtml: etichete din afara listei se scot, cu tot conținutul", () => {
  it.each([
    ["script", "<script>alert(1)</script>"],
    ["script la început (DOMParser l-ar muta în head)", "<script>x</script><p>a</p>"],
    ["iframe", '<iframe src="https://evil.example"></iframe>'],
    ["img (încarcă din afară)", '<img src="https://evil.example/pixel.png">'],
    ["form", '<form action="https://evil.example"><button>Trimite</button></form>'],
    ["svg", "<svg><script>alert(1)</script></svg>"],
    ["style", "<style>body { display: none }</style>"],
    ["table (nu e în lista din contract)", "<table><tr><td>x</td></tr></table>"],
    ["h5", "<h5>titlu mic</h5>"],
  ])("%s", (_name, html) => {
    const result = validateHtml(html);
    expect(result.dropped.map((d) => d.reason)).toEqual(["tag"]);
    expect(result.rejected).toBe(false);
    expect(result.html).not.toMatch(/<(script|iframe|img|form|svg|style|table|h5)/);
  });

  it("scoate doar eticheta greșită, nu tot", () => {
    expect(validateHtml("<div><p>rămâne</p><script>alert(1)</script></div>").html).toBe("<div><p>rămâne</p></div>");
  });

  it("rădăcina interfeței noastre nu se poate imita", () => {
    const [dropped] = validateHtml("<uishapeshifter-root></uishapeshifter-root>").dropped;
    expect(dropped).toMatchObject({ reason: "tag", message: expect.stringContaining("interfața extensiei") });
  });
});

describe("validateHtml: atribute din afara listei se scot", () => {
  it.each([
    ["onclick", '<button onclick="alert(1)">x</button>', /rulează cod/],
    ["ONMOUSEOVER cu majuscule", '<div ONMOUSEOVER="alert(1)">x</div>', /rulează cod/],
    ["style", '<div style="color: red">x</div>', /CSS-ul rețetei/],
    ["id", '<div id="x">x</div>', /nu e permis/],
    ["target", '<a href="/x" target="_blank">x</a>', /nu e permis/],
    ["data-agent-id", '<button data-agent-id="mascot.close">x</button>', /nu e permis/],
  ])("%s → attribute, iar elementul rămâne fără el", (_name, html, message) => {
    const result = validateHtml(html);
    expect(result.dropped).toEqual([
      expect.objectContaining({ reason: "attribute", message: expect.stringMatching(message) }),
    ]);
    expect(result.rejected).toBe(false);
  });

  it("o clasă care imită interfața noastră se scoate", () => {
    expect(reasonsOf('<div class="uishapeshifter-panel">x</div>')).toEqual(["attribute"]);
  });
});

describe("validateHtml: un link greșit respinge operația întreagă (specs/03)", () => {
  it.each([
    ["javascript:", '<a href="javascript:alert(1)">x</a>'],
    ["cu spații și tab", '<a href=" java\tscript:alert(1)">x</a>'],
    ["cu entități HTML", '<a href="&#106;avascript:alert(1)">x</a>'],
    ["data:", '<a href="data:text/html,<script>alert(1)</script>">x</a>'],
    ["http fără s", '<a href="http://exemplu.test">x</a>'],
    ["// spre alt site", '<a href="//evil.example/x">x</a>'],
  ])("%s → href, rejected, html gol", (_name, html) => {
    const result = validateHtml(html);
    expect(result.dropped.map((d) => d.reason)).toEqual(["href"]);
    expect(result).toMatchObject({ rejected: true, html: "" });
  });

  it("motivul are mesaj în română și o bucată din element", () => {
    const [dropped] = validateHtml('<a href="javascript:alert(1)">x</a>').dropped;
    expect(dropped.message).toMatch(/începe cu \/, # sau https:\/\//);
    expect(dropped.snippet).toContain("javascript:");
  });
});

describe("validateHtml: mărimea", () => {
  it(`peste ${DOM_OP_LIMITS.maxHtmlBytes} de octeți → size, rejected`, () => {
    const result = validateHtml(`<p>${"x".repeat(DOM_OP_LIMITS.maxHtmlBytes)}</p>`);
    expect(result.dropped.map((d) => d.reason)).toEqual(["size"]);
    expect(result).toMatchObject({ rejected: true, html: "" });
  });
});
