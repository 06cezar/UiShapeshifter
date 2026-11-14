// „Fundal roz peste tot”: cutiile mari și albe ale site-ului primesc culoarea; butoanele și cutiile mici, nu.

import { describe, expect, test } from "vitest";
import { isLightOpaque, pageBackgroundFrom, startPageBackground } from "./page-background";

describe("fundalul paginii peste tot", () => {
  test("culoarea vine din regula pentru html sau body; altceva sau url() nu", () => {
    expect(
      pageBackgroundFrom("html, body { background: #ffd6e7 !important; background-image: none !important; }"),
    ).toBe("#ffd6e7");
    expect(pageBackgroundFrom("a { color: red }")).toBeNull();
    expect(pageBackgroundFrom("body { background: url(x.png) }")).toBeNull();
  });

  test("doar fundalurile deschise și opace", () => {
    expect(isLightOpaque("rgb(255, 255, 255)")).toBe(true);
    expect(isLightOpaque("rgb(249, 249, 249)")).toBe(true);
    expect(isLightOpaque("rgb(33, 150, 243)")).toBe(false);
    expect(isLightOpaque("rgba(255, 255, 255, 0)")).toBe(false);
  });

  test("cutia mare albă se colorează, butonul și cutia mică nu; la oprire revin", () => {
    document.body.innerHTML = `
      <main id="mare" style="background-color: rgb(255, 255, 255)">conținut</main>
      <div id="mica" style="background-color: rgb(255, 255, 255)">mic</div>
      <button id="buton" style="background-color: rgb(255, 255, 255)">Sign In</button>`;
    const sizes: Record<string, { width: number; height: number }> = {
      mare: { width: 2000, height: 900 },
      mica: { width: 40, height: 20 },
      buton: { width: 2000, height: 900 },
    };
    const stop = startPageBackground("#ffd6e7", {
      ourHostId: "uishapeshifter-root",
      rectOf: (element) => sizes[element.id] ?? { width: 0, height: 0 },
    });
    const bg = (id: string) => document.getElementById(id)!.style.getPropertyValue("background-color");
    expect(bg("mare")).toBe("#ffd6e7");
    expect(bg("mica")).toBe("rgb(255, 255, 255)");
    expect(bg("buton")).toBe("rgb(255, 255, 255)");
    stop();
    expect(bg("mare")).toBe("rgb(255, 255, 255)");
  });
});
