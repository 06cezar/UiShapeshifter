import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { BASE_STYLE_ID, startBasePreferences, type BasePreferences } from "./base-preferences";
import { contrastRatio, parseColor, toHex } from "./contrast";

const HOST_ID = "uishapeshifter-root";
const MARIA = { minFontPx: 20, contrast: "high" as const, minTargetPx: 56, reducedMotion: true };

let base: BasePreferences | undefined;

/** happy-dom nu face layout: mărimea vine din `data-rect="lățime,înălțime"` (implicit 300×30). */
function page(html: string): void {
  document.body.innerHTML = html;
  sizeAll();
}

function sizeAll(): void {
  for (const el of document.querySelectorAll<HTMLElement>("*")) {
    const [width, height] = (el.dataset.rect ?? "300,30").split(",").map(Number);
    el.getBoundingClientRect = () => new DOMRect(0, 0, width, height);
  }
}

function el(id: string): HTMLElement {
  return document.getElementById(id)!;
}

function fontOf(id: string): number {
  return parseFloat(getComputedStyle(el(id)).fontSize);
}

beforeEach(() => {
  page(`
    <h1 id="titlu" style="font-size: 32px">Titlu mare</h1>
    <p id="mic" style="font-size: 12px; color: #000000">Text mărunt</p>
    <p id="gri" style="font-size: 20px; color: #999999">Text gri</p>
    <button id="buton" data-rect="30,30" style="font-size: 20px; color: #000000">OK</button>
    <p id="fraza" style="font-size: 20px; color: #000000">Vezi <a id="inline" href="/x" data-rect="40,20" style="display: inline; color: #000000">aici</a> detalii.</p>
    <div id="${HOST_ID}"><p id="mascota" style="font-size: 10px">a noastră</p></div>`);
});

afterEach(() => {
  base?.stop();
  base = undefined;
  document.body.innerHTML = "";
  document.head.innerHTML = "";
});

describe("preferințele de bază, cu profilul „20px, contrast mare”", () => {
  it("ridică textul mic la 20px și lasă titlurile mari cum sunt", () => {
    base = startBasePreferences({ needs: MARIA, ourHostId: HOST_ID });
    expect(fontOf("mic")).toBe(20);
    expect(fontOf("titlu")).toBe(32);
  });

  it("întunecă textul gri până la contrastul mare (7:1)", () => {
    base = startBasePreferences({ needs: MARIA, ourHostId: HOST_ID });
    const color = toHex(parseColor(getComputedStyle(el("gri")).color)!);
    expect(contrastRatio(color, "#FFFFFF")).toBeGreaterThanOrEqual(7);
  });

  it("mărește butoanele mici la 56px, dar nu și linkurile din mijlocul unei fraze", () => {
    base = startBasePreferences({ needs: MARIA, ourHostId: HOST_ID });
    expect(el("buton").style.getPropertyValue("min-height")).toBe("56px");
    expect(el("inline").style.getPropertyValue("min-height")).toBe("");
  });

  it("nu atinge interfața noastră", () => {
    base = startBasePreferences({ needs: MARIA, ourHostId: HOST_ID });
    expect(fontOf("mascota")).toBe(10);
  });

  it("mișcare redusă: pune foaia noastră, care oprește animațiile", () => {
    base = startBasePreferences({ needs: MARIA, ourHostId: HOST_ID });
    expect(document.getElementById(BASE_STYLE_ID)?.textContent).toContain("animation-duration");
  });
});

describe("peste CSS-ul agentului", () => {
  it("o regulă !important a rețetei, cu selector specific, nu coboară textul sub minim", () => {
    const recipe = document.createElement("style");
    recipe.textContent = "body p#mic { font-size: 10px !important; }";
    document.head.append(recipe);
    base = startBasePreferences({ needs: MARIA, ourHostId: HOST_ID });
    expect(fontOf("mic")).toBe(20);
  });
});

describe("pagina care se schimbă singură", () => {
  it("ce adaugă site-ul după încărcare primește aceleași limite", async () => {
    base = startBasePreferences({ needs: MARIA, ourHostId: HOST_ID });
    const later = document.createElement("p");
    later.id = "tarziu";
    later.style.fontSize = "11px";
    later.textContent = "Încărcat mai târziu";
    later.getBoundingClientRect = () => new DOMRect(0, 0, 300, 30);
    document.body.append(later);
    await Promise.resolve(); // observatorul
    await Promise.resolve(); // ajustarea, după schimbarea site-ului
    expect(fontOf("tarziu")).toBe(20);
  });
});

describe("oprire și schimbarea profilului", () => {
  it("stop() pune pagina la loc exact cum era, inclusiv stilul inline al site-ului", () => {
    base = startBasePreferences({ needs: MARIA, ourHostId: HOST_ID });
    base.stop();
    base = undefined;
    expect(el("mic").style.getPropertyValue("font-size")).toBe("12px");
    expect(el("buton").style.getPropertyValue("min-height")).toBe("");
    expect(document.getElementById(BASE_STYLE_ID)).toBeNull();
  });

  it("update() cu alt profil reface totul după noile limite", () => {
    base = startBasePreferences({ needs: MARIA, ourHostId: HOST_ID });
    base.update({ minFontPx: 24 });
    expect(fontOf("mic")).toBe(24);
    expect(fontOf("gri")).toBe(24);
    expect(el("buton").style.getPropertyValue("min-height")).toBe("44px"); // fără minTargetPx în profil: 44
    expect(document.getElementById(BASE_STYLE_ID)).toBeNull(); // fără reducedMotion
  });

  it("fără profil se aplică tot minimul global: 16px", () => {
    base = startBasePreferences({ needs: {}, ourHostId: HOST_ID });
    expect(fontOf("mic")).toBe(16);
    expect(base.adjustedCount()).toBeGreaterThan(0);
  });
});
