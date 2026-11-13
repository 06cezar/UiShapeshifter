import { describe, expect, it } from "vitest";
import { validateHtml } from "./html";
import type { HtmlDropReason } from "./result";

function reasonsOf(html: string): HtmlDropReason[] {
  return validateHtml(html).dropped.map((d) => d.reason);
}

describe("validateHtml: ce trece", () => {
  it("o placă obișnuită trece neschimbată", () => {
    const html =
      '<div class="placa" role="region" aria-label="Factura"><h2>Factura</h2>' +
      '<p>Scadentă <time datetime="2026-11-20">pe 20</time></p>' +
      '<a href="https://exemplu.test/plata" target="_blank" rel="noopener">Plătește</a>' +
      '<button type="button" data-shortcut="plata">Plătește acum</button></div>';
    expect(validateHtml(html)).toEqual({ html, dropped: [] });
  });

  it("linkuri relative, ancore, mailto și tel sunt permise", () => {
    expect(
      reasonsOf('<a href="/cos">Coș</a><a href="#sus">Sus</a><a href="mailto:a@b.test">M</a><a href="tel:0700">T</a>'),
    ).toEqual([]);
  });

  it("întoarce forma normalizată de parser (pe ea s-a făcut verificarea)", () => {
    expect(validateHtml("<p>neînchis").html).toBe("<p>neînchis</p>");
  });
});

describe("validateHtml: etichete", () => {
  it.each([
    ["script", "<script>alert(1)</script>"],
    ["script la început (DOMParser l-ar muta în head)", "<script>x</script><p>a</p>"],
    ["iframe", '<iframe src="https://evil.example"></iframe>'],
    ["img (încarcă din afară)", '<img src="https://evil.example/pixel.png">'],
    ["form", '<form action="https://evil.example"><button>Trimite</button></form>'],
    ["svg", "<svg><script>alert(1)</script></svg>"],
    ["style", "<style>body { display: none }</style>"],
    ["object", '<object data="x"></object>'],
  ])("%s e scos", (_name, html) => {
    const result = validateHtml(html);
    expect(result.dropped.map((d) => d.reason)).toEqual(["tag"]);
    expect(result.html).not.toMatch(/<(script|iframe|img|form|svg|style|object)/);
  });

  it("scoate doar eticheta greșită, nu tot", () => {
    const result = validateHtml("<div><p>rămâne</p><script>alert(1)</script></div>");
    expect(result.html).toBe("<div><p>rămâne</p></div>");
  });

  it("un element scos ia cu el și ce e înăuntru, raportat o singură dată", () => {
    expect(reasonsOf('<form><input name="x"><select></select></form>')).toEqual(["tag"]);
  });

  it("rădăcina interfeței noastre nu se poate imita", () => {
    expect(reasonsOf("<uishapeshifter-root></uishapeshifter-root>")).toEqual(["targets-our-ui"]);
  });
});

describe("validateHtml: atribute", () => {
  it.each([
    ["onclick", '<button onclick="alert(1)">x</button>'],
    ["onmouseover cu majuscule", '<div ONMOUSEOVER="alert(1)">x</div>'],
    ["onerror", '<span onerror="x">x</span>'],
  ])("%s → event-handler, iar elementul rămâne fără el", (_name, html) => {
    const result = validateHtml(html);
    expect(result.dropped.map((d) => d.reason)).toEqual(["event-handler"]);
    expect(result.html).not.toMatch(/on[a-z]+=/i);
  });

  it.each([
    ["javascript:", '<a href="javascript:alert(1)">x</a>'],
    ["cu spații și tab", '<a href=" java\tscript:alert(1)">x</a>'],
    ["cu entități HTML", '<a href="&#106;avascript:alert(1)">x</a>'],
    ["data:", '<a href="data:text/html,<script>alert(1)</script>">x</a>'],
    ["vbscript:", '<a href="vbscript:x">x</a>'],
  ])("link %s → script-url", (_name, html) => {
    const result = validateHtml(html);
    expect(result.dropped.map((d) => d.reason)).toEqual(["script-url"]);
    expect(result.html).toBe("<a>x</a>");
  });

  it("link cu altă schemă (ftp:) → attribute", () => {
    expect(reasonsOf('<a href="ftp://x.test/a">x</a>')).toEqual(["attribute"]);
  });

  it("atribute din afara listei: src, formaction, srcdoc", () => {
    expect(reasonsOf('<button formaction="https://evil.example">x</button><div srcdoc="x"></div>')).toEqual([
      "attribute",
      "attribute",
    ]);
  });

  it("data-agent-id e al nostru", () => {
    expect(reasonsOf('<button data-agent-id="mascot.close">x</button>')).toEqual(["targets-our-ui"]);
  });

  it("style trece prin validateCss: fără url, fără să iasă din regulă spre interfața noastră", () => {
    expect(reasonsOf('<div style="color: red; font-size: 20px">x</div>')).toEqual([]);
    expect(reasonsOf('<div style="background: url(https://evil.example/x)">x</div>')).toEqual(["style"]);
    expect(reasonsOf('<div style="color: red } [data-agent-id] { display: none">x</div>')).toEqual(["targets-our-ui"]);
  });

  it("motivul are mesaj în română și o bucată din element", () => {
    const [dropped] = validateHtml('<button onclick="alert(1)">x</button>').dropped;
    expect(dropped.message).toMatch(/rulează cod/);
    expect(dropped.snippet).toContain("onclick");
  });
});
