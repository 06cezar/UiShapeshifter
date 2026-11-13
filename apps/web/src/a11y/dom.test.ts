// @vitest-environment happy-dom
import { beforeEach, describe, expect, it } from "vitest";
import { collectDomFacts, effectiveBackground } from "./dom";
import { toHex } from "./contrast";

beforeEach(() => {
  document.body.innerHTML = `
    <main style="background-color: #111111">
      <section style="background-color: rgba(255, 255, 255, 0.5)">
        <p data-agent-id="chat.ana.msg" style="font-size: 20px; line-height: 24px">Bună, bunico!</p>
        <p data-agent-id="chat.ana.last" style="font-size: 20px; line-height: normal; text-overflow: ellipsis">Ultimul mesaj</p>
        <button data-agent-id="messages.send" style="border: 2px solid #EEEEEE; font-size: 20px">Trimite</button>
        <span data-agent-id="home.deco" aria-hidden="true">★</span>
        <div data-agent-id="messages.list"><p>fără text propriu</p></div>
      </section>
    </main>`;
});

describe("collectDomFacts", () => {
  it("înălțimea rândului, ca raport", () => {
    const facts = collectDomFacts();
    expect(facts["chat.ana.msg"].lineHeight).toBeCloseTo(1.2, 5);
    expect(facts["chat.ana.last"].lineHeight).toBeCloseTo(1.2, 5); // normal
    expect(facts["messages.list"].lineHeight).toBeUndefined(); // textul e al copilului
  });
  it("text-overflow intenționat și text decorativ", () => {
    const facts = collectDomFacts();
    expect(facts["chat.ana.last"].intentionalOverflow).toBe(true);
    expect(facts["chat.ana.msg"].intentionalOverflow).toBeUndefined();
    expect(facts["home.deco"].decorative).toBe(true);
  });
  it("marginea butonului și fundalul din jur (compus)", () => {
    const facts = collectDomFacts();
    expect(facts["messages.send"].nonText).toEqual({ color: "#EEEEEE", background: "#888888" });
  });
});

describe("effectiveBackground", () => {
  it("compune fundalurile semitransparente peste primul opac", () => {
    expect(toHex(effectiveBackground(document.querySelector("section")))).toBe("#888888");
    expect(toHex(effectiveBackground(document.querySelector("main")))).toBe("#111111");
  });
});
