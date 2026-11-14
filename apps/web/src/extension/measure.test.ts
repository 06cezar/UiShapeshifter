// Măsurătorile pentru pitch (E4): click-urile până la o acțiune.

import { afterEach, describe, expect, test, vi } from "vitest";
import { clicksTo } from "./measure";

afterEach(() => {
  vi.restoreAllMocks();
  document.body.innerHTML = "";
});

describe("click-uri până la o acțiune", () => {
  test("la vedere: 1; într-un meniu închis: 2; inexistent: null", () => {
    vi.spyOn(Element.prototype, "getBoundingClientRect").mockImplementation(function (this: Element) {
      const hidden = this.closest("details:not([open]) > :not(summary)") !== null;
      return {
        x: 0,
        y: 0,
        width: hidden ? 0 : 50,
        height: hidden ? 0 : 20,
        top: 0,
        left: 0,
        right: 50,
        bottom: 20,
        toJSON() {},
      } as DOMRect;
    });
    document.body.innerHTML = `<button>Caută</button><details><summary>⋯</summary><a href="/p">Plătește factura</a></details>`;
    expect(clicksTo(document, "Caută")).toBe(1);
    expect(clicksTo(document, "plătește factura")).toBe(2);
    expect(clicksTo(document, "Nu există")).toBe(null);
  });
});
