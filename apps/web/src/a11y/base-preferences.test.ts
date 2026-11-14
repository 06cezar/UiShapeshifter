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
  it("rândurile prea înghesuite ale unui paragraf ajung la 1.5 (WCAG 1.4.12), și cele cu înălțime fixă după ce crește fontul", () => {
    // paragrafe pe mai multe rânduri: cutia e de cel puțin două ori cât un rând
    page(`
      <p id="normal" data-rect="300,90" style="font-size: 20px; line-height: normal">Text pe mai multe rânduri</p>
      <p id="fix" data-rect="300,60" style="font-size: 12px; line-height: 14px">Text mic, rânduri fixe</p>
      <p id="aerisit" data-rect="300,96" style="font-size: 20px; line-height: 32px">Deja aerisit</p>
      <h2 id="titlu" data-rect="300,90" style="font-size: 28px; line-height: 1.1">Titlu</h2>`);
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
    // fără minTargetPx peste implicit, țintele nu se mai măresc (specs/07: doar la cererea testului de atingere)
    expect(el("buton").style.getPropertyValue("min-height")).toBe("");
    expect(document.getElementById(BASE_STYLE_ID)).toBeNull(); // fără reducedMotion
  });

  it("fără profil se aplică tot minimul global: 16px", () => {
    base = startBasePreferences({ needs: {}, ourHostId: HOST_ID });
    expect(fontOf("mic")).toBe(16);
    expect(base.adjustedCount()).toBeGreaterThan(0);
  });
});

/**
 * happy-dom nu face layout: aici dreptunghiul fiecărui element se calculează din stilul lui, ca să vedem ce se
 * întâmplă după ce C4 scrie (min-width, min-height, font-size).
 */
function layout(id: string, rectOf: (el: HTMLElement) => DOMRect): void {
  const element = el(id);
  element.getBoundingClientRect = () => rectOf(element);
}
const px = (value: string, fallback: number) => parseFloat(value) || fallback;

describe("verificarea de după scriere (Teams, WhatsApp, Instagram, găsite de Adelin)", () => {
  it("Teams: avatarul mărit ar acoperi numele, deci rămâne cum era; numele crește", () => {
    page(`
      <div id="antet" data-rect="600,40">
        <button id="avatar" style="position: absolute; font-size: 12px">IB</button>
        <span id="nume" style="font-size: 14px">IULIA TEODORA</span>
      </div>`);
    layout(
      "avatar",
      (a) => new DOMRect(0, 0, Math.max(32, px(a.style.minWidth, 0)), Math.max(32, px(a.style.minHeight, 0))),
    );
    layout("nume", () => new DOMRect(36, 0, 200, 20));
    base = startBasePreferences({ needs: MARIA, ourHostId: HOST_ID });
    expect(el("avatar").style.minWidth).toBe("");
    expect(fontOf("avatar")).toBe(12);
    expect(fontOf("nume")).toBe(20);
  });

  it("WhatsApp: ora din colțul bulei (float) ar trece peste mesaj, deci rămâne mică; mesajul crește", () => {
    page(`
      <div id="bula" data-rect="300,40">
        <span id="mesaj" style="font-size: 14px">Ne vedem mâine la 10</span>
        <div id="meta" style="float: right"><span id="ora" style="font-size: 11px">12:34</span></div>
      </div>`);
    layout("bula", () => new DOMRect(0, 0, 300, 40));
    layout("mesaj", (m) => new DOMRect(0, 0, 260, (20 * px(m.style.fontSize, 14)) / 14));
    layout("ora", (o) => {
      const scale = px(o.style.fontSize, 11) / 11;
      return new DOMRect(300 - 30 * scale, 10, 30 * scale, 14 * scale);
    });
    base = startBasePreferences({ needs: MARIA, ourHostId: HOST_ID });
    expect(fontOf("ora")).toBe(11);
    expect(fontOf("mesaj")).toBe(20);
  });

  it("WhatsApp, mesaj editat: «Editat 08:58» atingea deja cutia mesajului, dar mărit îl acoperă: rămâne mic (găsit de E)", () => {
    page(`
      <div id="bula-editata" data-rect="300,40">
        <span id="mesaj-lung" style="font-size: 14px">Ajung puțin mai târziu, pornesc acum de acasă</span>
        <div id="meta-editat" style="position: absolute"><span id="editat" style="font-size: 11px">Editat</span><span id="ora-editat" style="font-size: 11px">08:58</span></div>
      </div>`);
    // cutia mesajului ține toată lățimea bulei (cu spațiul lăsat pentru colț), deci atinge colțul încă de la început;
    // bula crește odată cu mesajul, iar colțul stă lipit de marginea ei de jos
    const messageHeight = () => (40 * px(el("mesaj-lung").style.fontSize, 14)) / 14;
    layout("bula-editata", () => new DOMRect(0, 0, 300, messageHeight()));
    layout("mesaj-lung", () => new DOMRect(0, 0, 300, messageHeight()));
    const corner = (id: string, offset: number, width: number) =>
      layout(id, (e) => {
        const scale = px(e.style.fontSize, 11) / 11;
        return new DOMRect(300 - (offset + width) * scale, messageHeight() - 14 * scale, width * scale, 14 * scale);
      });
    corner("ora-editat", 0, 30);
    corner("editat", 30, 34);
    base = startBasePreferences({ needs: MARIA, ourHostId: HOST_ID });
    expect(fontOf("editat")).toBe(11);
    expect(fontOf("ora-editat")).toBe(11);
    expect(fontOf("mesaj-lung")).toBe(20);
  });

  it("WhatsApp: textul mărit care ajunge sub colțul «Editat 08:58» primește la capăt spațiul care lipsește (găsit de E)", () => {
    page(`
      <div id="bula-scurta" data-rect="300,40">
        <span id="mesaj-mare" style="font-size: 14px">Bine, ne vedem acolo la ora stabilită</span>
        <div id="colt" style="position: absolute"><span id="editat-2" style="font-size: 11px">Editat</span><span id="ora-2" style="font-size: 11px">08:58</span></div>
      </div>`);
    const scale = () => px(el("mesaj-mare").style.fontSize, 14) / 14;
    const bubbleHeight = () => 24 * scale();
    layout("bula-scurta", () => new DOMRect(0, 0, 300, bubbleHeight()));
    // la 14px, textul se oprește la 200px, înainte de colț (236–300); mărit, ajunge la 286px
    layout("mesaj-mare", () => new DOMRect(0, 0, 200 * scale(), bubbleHeight()));
    const corner = (id: string, offset: number, width: number) =>
      layout(id, (e) => {
        const own = px(e.style.fontSize, 11) / 11;
        return new DOMRect(300 - (offset + width) * own, bubbleHeight() - 14 * own, width * own, 14 * own);
      });
    corner("ora-2", 0, 30);
    corner("editat-2", 30, 34);
    base = startBasePreferences({ needs: MARIA, ourHostId: HOST_ID });
    expect(fontOf("editat-2")).toBe(11);
    expect(fontOf("mesaj-mare")).toBe(20);
    // trebuie cel puțin 54px (286 − 236 + 4); estimarea fără a doua măsurare poate da ceva mai mult, cel mult un colț
    const room = px(el("mesaj-mare").style.getPropertyValue("padding-inline-end"), 0);
    expect(room).toBeGreaterThanOrEqual(54);
    expect(room).toBeLessThanOrEqual(164);
    base.stop();
    expect(el("mesaj-mare").style.getPropertyValue("padding-inline-end")).toBe("");
  });

  it("Instagram: linkul din jurul unei poze nu se mărește dacă poza ar crește odată cu el", () => {
    page(
      `<p id="nume-ig" style="font-size: 20px">utilizator</p><a id="link" href="/u"><img id="poza" alt="profil"></a>`,
    );
    const linkSize = () => Math.max(32, px(el("link").style.minWidth, 0));
    layout("link", () => new DOMRect(0, 100, linkSize(), linkSize()));
    layout("poza", () => new DOMRect(0, 100, linkSize(), linkSize()));
    base = startBasePreferences({ needs: MARIA, ourHostId: HOST_ID });
    expect(el("link").style.minWidth).toBe("");
    expect(el("link").style.display).toBe("");
  });

  it("un buton mic în flux, care împinge textul de sub el, rămâne mărit", () => {
    page(`<button id="mic" style="font-size: 20px">OK</button><p id="sub" style="font-size: 20px">Text dedesubt</p>`);
    const size = () => Math.max(30, px(el("mic").style.minHeight, 0));
    layout("mic", () => new DOMRect(0, 0, size(), size()));
    layout("sub", () => new DOMRect(0, size() + 10, 300, 24));
    base = startBasePreferences({ needs: MARIA, ourHostId: HOST_ID });
    expect(el("mic").style.minHeight).toBe("56px");
  });

  it("o margine cu aceeași culoare ca fundalul (pusă să nu se vadă) nu devine vizibilă", () => {
    page(`<button id="reactie" style="border: 1px solid #ffffff; font-size: 20px" data-rect="60,60">+</button>`);
    base = startBasePreferences({ needs: MARIA, ourHostId: HOST_ID });
    expect(el("reactie").style.borderColor).toBe("#ffffff"); // culoarea site-ului, nerescrisă de noi
  });
});

describe("profilul implicit nu deformează site-urile la prima vizită (găsit de Adelin)", () => {
  it("fără test de atingere: fontul crește la 16px, dar butoanele și linkurile mici rămân cum sunt", () => {
    page(`
      <button id="mic" data-rect="30,30" style="font-size: 12px">OK</button>
      <nav><a id="meniu" href="/x" data-rect="60,20" style="font-size: 12px">Acasă</a></nav>`);
    base = startBasePreferences({ needs: { minFontPx: 16, minTargetPx: 44 }, ourHostId: HOST_ID });
    expect(fontOf("mic")).toBe(16);
    expect(fontOf("meniu")).toBe(16);
    expect(el("mic").style.minHeight).toBe("");
    expect(el("meniu").style.minWidth).toBe("");
    expect(el("meniu").style.display).toBe("");
  });

  it("cu țintele cerute de testul de atingere (56px), butonul mic crește", () => {
    page(`<button id="mic" data-rect="30,30" style="font-size: 20px">OK</button>`);
    base = startBasePreferences({ needs: { minFontPx: 16, minTargetPx: 56 }, ourHostId: HOST_ID });
    expect(el("mic").style.minHeight).toBe("56px");
  });
});

describe("etichetele pe un rând rămân la locul lor (YouTube și Instagram, găsite de Adelin)", () => {
  const ours = (id: string, property: string) => el(id).style.getPropertyPriority(property) === "important";

  it("numărul de abonați de sub numele canalului: fontul crește, rândul își păstrează înălțimea", () => {
    page(`
      <div id="info" data-rect="103,42" style="height: 42px; overflow: hidden">
        <a id="canal" href="/c" data-rect="44,22" style="display: block; font-size: 16px; line-height: 22px">jawed</a>
        <span id="abonati" data-rect="99,18" style="display: block; font-size: 12px; line-height: 18px">6,74 mil. abonați</span>
      </div>`);
    base = startBasePreferences({ needs: { minFontPx: 16 }, ourHostId: HOST_ID });
    expect(fontOf("abonati")).toBe(16);
    // rândul rămâne de 18px, ca la site: 22 + 18 încap în cei 42px și numele canalului nu urcă
    expect(el("abonati").style.getPropertyValue("line-height")).toBe("18px");
    expect(ours("canal", "line-height")).toBe(false);
  });

  it("o etichetă pe un rând cu rânduri strânse, dar font destul de mare, nu e atinsă deloc", () => {
    page(
      `<span id="aprecieri" data-rect="60,18" style="display: block; font-size: 16px; line-height: 18px">1.234</span>`,
    );
    base = startBasePreferences({ needs: { minFontPx: 16 }, ourHostId: HOST_ID });
    expect(ours("aprecieri", "line-height")).toBe(false);
    expect(ours("aprecieri", "font-size")).toBe(false);
  });

  it("rândul nu rămâne mai scund decât fontul ridicat; cu line-height normal nu scriem nimic", () => {
    page(`
      <span id="strans" data-rect="60,14" style="display: block; font-size: 12px; line-height: 14px">Acum 2 ore</span>
      <span id="normal" data-rect="60,14" style="display: block; font-size: 12px; line-height: normal">Acum 3 ore</span>`);
    base = startBasePreferences({ needs: { minFontPx: 16 }, ourHostId: HOST_ID });
    expect(el("strans").style.getPropertyValue("line-height")).toBe("16px");
    expect(ours("normal", "line-height")).toBe(false);
    expect(fontOf("normal")).toBe(16);
  });

  it("titlul tăiat la două rânduri (cutie cu max-height) nu primește rânduri mai înalte: i s-ar tăia ultimul rând", () => {
    page(`
      <a id="titlu-card" href="/v" data-rect="300,40" style="display: block; max-height: 40px; overflow: hidden; line-height: 20px">
        <span id="titlu-text" data-rect="300,40" style="font-size: 14px; line-height: 20px">Un titlu lung de clip, pe două rânduri întregi</span>
      </a>
      <p id="paragraf" data-rect="300,60" style="font-size: 14px; line-height: 20px">Un paragraf liber, pe trei rânduri</p>`);
    base = startBasePreferences({ needs: { minFontPx: 16 }, ourHostId: HOST_ID });
    expect(fontOf("titlu-text")).toBe(16);
    expect(ours("titlu-text", "line-height")).toBe(false); // 2 × 20px încap în cei 40px ai cutiei
    expect(el("paragraf").style.getPropertyValue("line-height")).toBe("1.5"); // paragraful liber se aerisește
  });

  it("când mărirea fontului e anulată la verificare, pleacă și rândul scris pentru ea", () => {
    page(`
      <div id="bula" data-rect="300,40">
        <span id="mesaj" style="font-size: 16px">Ne vedem mâine la 10</span>
        <div id="meta" style="float: right"><span id="ora" style="font-size: 11px; line-height: 12px">12:34</span></div>
      </div>`);
    layout("bula", () => new DOMRect(0, 0, 300, 40));
    layout("mesaj", () => new DOMRect(0, 0, 260, 20));
    layout("ora", (o) => {
      const scale = px(o.style.fontSize, 11) / 11;
      return new DOMRect(300 - 30 * scale, 10, 30 * scale, 14 * scale);
    });
    base = startBasePreferences({ needs: { minFontPx: 20 }, ourHostId: HOST_ID });
    expect(fontOf("ora")).toBe(11);
    expect(el("ora").style.getPropertyValue("line-height")).toBe("12px"); // al site-ului, nu cel scris de noi
    expect(ours("ora", "line-height")).toBe(false);
  });

  it("un rând cu elemente în el nu primește line-height fix: s-ar moșteni la copiii cu alt font", () => {
    page(
      `<div id="rand" data-rect="300,18" style="font-size: 12px; line-height: 18px">Apreciat de <b id="cine">ana</b></div>`,
    );
    base = startBasePreferences({ needs: { minFontPx: 16 }, ourHostId: HOST_ID });
    expect(fontOf("rand")).toBe(16);
    expect(ours("rand", "line-height")).toBe(false);
  });
});

describe("conținutul încărcat mai târziu e verificat împreună cu vecinii (Google, găsit de E)", () => {
  it("adresa mărită la încărcare revine când linkul «Traducerea acestei pagini» apare și crește peste ea", async () => {
    page(
      `<div id="rezultat"><div id="rand"><cite id="adresa" style="font-size: 12px">https://www.wikipedia.org</cite></div></div>`,
    );
    layout("adresa", (c) => new DOMRect(124, 334, (135 * px(c.style.fontSize, 12)) / 12, 18));
    base = startBasePreferences({ needs: { minFontPx: 20 }, ourHostId: HOST_ID });
    expect(fontOf("adresa")).toBe(20); // singură pe rând, la încărcare: nimic de acoperit

    // linkul apare după încărcare, aliniat la dreapta rândului: crescut, se întinde spre stânga, peste adresă
    const link = document.createElement("a");
    link.id = "traducere";
    link.href = "/t";
    link.style.fontSize = "12px";
    link.textContent = "Traducerea acestei pagini";
    el("rand").append(link);
    layout("traducere", (t) => {
      const width = (120 * px(t.style.fontSize, 12)) / 12;
      return new DOMRect(520 - width, 334, width, 18);
    });
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(fontOf("traducere")).toBe(20);
    expect(fontOf("adresa")).toBe(12); // ca la o trecere întreagă: adresa nu mai stă sub link
  });
});
