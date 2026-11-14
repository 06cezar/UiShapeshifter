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

describe("rândurile și marginile", () => {
  it("rândurile prea înghesuite ajung la 1.5 (WCAG 1.4.12), și cele cu înălțime fixă după ce crește fontul", () => {
    page(`
      <p id="normal" style="font-size: 20px; line-height: normal">Text</p>
      <p id="fix" style="font-size: 12px; line-height: 14px">Text mic, rânduri fixe</p>
      <p id="aerisit" style="font-size: 20px; line-height: 32px">Deja aerisit</p>
      <h2 id="titlu" style="font-size: 28px; line-height: 1.1">Titlu</h2>`);
    base = startBasePreferences({ needs: MARIA, ourHostId: HOST_ID });
    expect(el("normal").style.getPropertyValue("line-height")).toBe("1.5");
    expect(el("fix").style.getPropertyValue("line-height")).toBe("1.5");
    expect(el("aerisit").style.getPropertyValue("line-height")).toBe("32px"); // al site-ului, neschimbat
    expect(el("titlu").style.getPropertyValue("line-height")).toBe("1.1"); // titlurile nu sunt text de citit
  });

  it("marginea unui buton care abia se vede ajunge la 3:1 pe fundalul din jur (WCAG 1.4.11)", () => {
    page(
      `<button id="palid" data-rect="80,60" style="border: 1px solid #dddddd; color: #000000; font-size: 20px">RO</button>`,
    );
    base = startBasePreferences({ needs: MARIA, ourHostId: HOST_ID });
    const border = el("palid").style.getPropertyValue("border-color");
    expect(border).not.toBe("");
    expect(contrastRatio(toHex(parseColor(border)!), "#FFFFFF")).toBeGreaterThanOrEqual(3);
  });
});

describe("ce găsise E pe Teams", () => {
  it("eticheta dintr-o bară laterală cu lățime fixă care taie textul rămâne cum e; textul obișnuit crește", () => {
    page(`
      <nav style="width: 64px" data-rect="64,500">
        <a href="/a"><span class="icon">🔔</span>
          <span id="eticheta" data-rect="64,16" style="font-size: 11px; overflow: hidden; white-space: nowrap; display: block">Activitate</span></a>
        <a href="/c"><span id="puncte" data-rect="64,16" style="font-size: 11px; text-overflow: ellipsis; overflow: hidden; display: block">Chat</span></a>
      </nav>
      <p id="paragraf" style="font-size: 11px; overflow: hidden">Un paragraf obișnuit, care trece pe rândul următor.</p>`);
    base = startBasePreferences({ needs: MARIA, ourHostId: HOST_ID });
    expect(fontOf("eticheta")).toBe(11);
    expect(fontOf("puncte")).toBe(11);
    expect(fontOf("paragraf")).toBe(20);
  });
});

describe("excepția Teams nu atinge meniurile late (review D pe #100)", () => {
  it("un meniu lat cu nowrap + overflow hidden: linkurile cresc la minim", () => {
    page(`
      <nav id="meniu" data-rect="1000,40" style="white-space: nowrap; overflow: hidden">
        <a id="acasa" href="/" data-rect="80,40" style="font-size: 11px">Acasă</a>
        <a id="produse" href="/p" data-rect="80,40" style="font-size: 11px">Produse</a>
      </nav>`);
    base = startBasePreferences({ needs: MARIA, ourHostId: HOST_ID });
    expect(fontOf("acasa")).toBe(20);
    expect(fontOf("produse")).toBe(20);
  });

  it("o frază lungă într-o cutie îngustă care taie tot crește: excepția e doar pentru etichete scurte", () => {
    page(`
      <div data-rect="100,20" style="overflow: hidden; white-space: nowrap">
        <span id="lung" data-rect="100,20" style="font-size: 11px">Aceasta este o propoziție lungă, nu o etichetă</span>
      </div>`);
    base = startBasePreferences({ needs: MARIA, ourHostId: HOST_ID });
    expect(fontOf("lung")).toBe(20);
  });
});

describe("ce găsise E pe site-ul de test", () => {
  it("textul alb pe un banner cu gradient nu e „reparat” după fundalul de rezervă", () => {
    page(`<div style="background-color: #ffffff; background-image: linear-gradient(90deg, #0b3d91, #1e88e5)">
      <p id="banner" style="color: #ffffff; font-size: 20px; line-height: 1.6">Doar azi: -15%</p></div>`);
    base = startBasePreferences({ needs: MARIA, ourHostId: HOST_ID });
    expect(el("banner").style.getPropertyValue("color")).toBe("#ffffff");
  });

  it("conținutul unui <details> deschis mai târziu primește și el limitele", async () => {
    page(`<details id="meniu"><summary>Mai multe</summary>
      <a id="plata" href="/plata" style="font-size: 10px">Plătește factura</a></details>`);
    const plata = el("plata");
    plata.checkVisibility = () => false; // închis: browserul nu-l desenează
    base = startBasePreferences({ needs: MARIA, ourHostId: HOST_ID });
    expect(fontOf("plata")).toBe(10);

    plata.checkVisibility = () => true;
    (el("meniu") as HTMLDetailsElement).open = true;
    await Promise.resolve(); // observatorul
    await Promise.resolve(); // ajustarea
    expect(fontOf("plata")).toBe(20);
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
