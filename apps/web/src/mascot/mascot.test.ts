import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { HOST_ID, mountOurRoot, ourShadowRoot } from "../extension/shadow-root";
import { DANCE_MS, type SpriteAnimation } from "./animations";
import type { Facing } from "./geometry";
import { mountMascot, type MascotController } from "./mascot";
import type { MascotRenderer } from "./renderer-sprite";

/** happy-dom nu decodează imagini: o randare falsă care ține minte ce i s-a cerut. */
function fakeRenderer() {
  const played: string[] = [];
  const faced: (Facing | "front")[] = [];
  const renderer: MascotRenderer = {
    play: (animation: SpriteAnimation) => played.push(animation.sheet),
    face: (facing) => faced.push(facing),
    dispose: () => {},
  };
  return { renderer, played, faced };
}

function rectAt(element: Element, x: number, y: number, width: number, height: number) {
  element.getBoundingClientRect = () => new DOMRect(x, y, width, height);
}

let mascot: MascotController | null = null;

/** `reducedMotion: true` = fără mers animat: poziția se schimbă pe loc, testul nu așteaptă cadre. */
async function setup(reducedMotion = true) {
  document.getElementById(HOST_ID)?.remove();
  const fake = fakeRenderer();
  mascot = mountMascot(mountOurRoot(document), {
    reducedMotion: () => reducedMotion,
    createRenderer: async () => fake.renderer,
  });
  await Promise.resolve(); // randarea falsă se creează asincron, ca modelul adevărat
  const shadow = ourShadowRoot(document.getElementById(HOST_ID))!;
  const q = <T extends Element>(selector: string) => shadow.querySelector<T>(selector)!;
  return { mascot, fake, q };
}

beforeEach(() => {
  document.body.innerHTML = "";
  window.innerWidth = 1000;
  window.innerHeight = 800;
});

afterEach(() => {
  mascot?.destroy();
  mascot = null;
});

describe("stări", () => {
  test("pornește în idle, în colțul de jos din dreapta", async () => {
    const { q, fake } = await setup();
    const root = q<HTMLElement>(".mascot");
    expect(root.dataset.state).toBe("idle");
    expect(root.dataset.agentId).toBe("mascot");
    expect(root.style.transform).toMatch(/translate\(\d+px, \d+px\)/);
    expect(fake.played.at(-1)).toBe("idle");
  });

  test("setState schimbă animația", async () => {
    const { mascot, q, fake } = await setup();
    mascot.setState("thinking");
    expect(q<HTMLElement>(".mascot").dataset.state).toBe("thinking");
    expect(fake.played.at(-1)).toBe("crouch");
    mascot.setState("happy");
    expect(fake.played.at(-1)).toBe("dance");
  });
});

describe("dansul", () => {
  test("după o rulare reușită dansează câteva secunde, apoi revine la idle", async () => {
    vi.useFakeTimers();
    try {
      const { mascot, fake } = await setup();
      mascot.setState("happy");
      expect(fake.played.at(-1)).toBe("dance");
      vi.advanceTimersByTime(DANCE_MS + 1);
      expect(mascot.state()).toBe("idle");
      expect(fake.played.at(-1)).toBe("idle");
    } finally {
      vi.useRealTimers();
    }
  });
});

describe("bula", () => {
  test("think arată gândul cu „…” fără timp fix; null îl ascunde; un mesaj îl înlocuiește", async () => {
    const { mascot, q } = await setup();
    const bubble = q<HTMLElement>(".mascot-bubble");
    mascot.think("Mă uit la pagină…");
    expect(bubble.hidden).toBe(false);
    expect(bubble.dataset.kind).toBe("thought");
    expect(bubble.textContent).toBe("Mă uit la pagină");
    expect(bubble.querySelectorAll(".mascot-dot")).toHaveLength(3);
    mascot.think(null);
    expect(bubble.hidden).toBe(true);
    mascot.think("Caut butonul");
    mascot.say("Gata.");
    expect(bubble.dataset.kind).toBe("message");
    mascot.think(null); // gândul gol nu ascunde un mesaj
    expect(bubble.hidden).toBe(false);
  });

  test("un gând nu acoperă bula de la point_at", async () => {
    const { mascot, q } = await setup();
    const button = document.createElement("button");
    document.body.append(button);
    rectAt(button, 100, 100, 80, 40);
    await mascot.pointAt(button, "Aici e butonul.");
    mascot.think("Verific pagina");
    expect(q<HTMLElement>(".mascot-bubble").textContent).toBe("Aici e butonul.");
  });

  test("say arată mesajul și îl ascunde după timpul dat", async () => {
    vi.useFakeTimers();
    try {
      const { mascot, q } = await setup();
      mascot.say("Aici e butonul.", 1000);
      expect(q<HTMLElement>(".mascot-bubble").hidden).toBe(false);
      expect(q<HTMLElement>(".mascot-bubble").textContent).toBe("Aici e butonul.");
      vi.advanceTimersByTime(1001);
      expect(q<HTMLElement>(".mascot-bubble").hidden).toBe(true);
    } finally {
      vi.useRealTimers();
    }
  });
});

describe("point_at", () => {
  test("un element ascuns: NOT_VISIBLE, mascota nu pleacă", async () => {
    const { mascot, q } = await setup();
    const hidden = document.createElement("button");
    hidden.style.display = "none";
    document.body.append(hidden);
    const before = q<HTMLElement>(".mascot").style.transform;

    const result = await mascot.pointAt(hidden, "Aici.");

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("NOT_VISIBLE");
    expect(q<HTMLElement>(".mascot").style.transform).toBe(before);
  });

  test("un element vizibil: merge lângă el, se uită spre el, îl conturează și spune mesajul", async () => {
    const { mascot, q, fake } = await setup();
    const button = document.createElement("button");
    document.body.append(button);
    rectAt(button, 400, 300, 100, 40);

    const result = await mascot.pointAt(button, "Apasă aici ca să plătești.");

    expect(result).toEqual({
      ok: true,
      data: { scrolledIntoView: false, rect: { x: 400, y: 300, width: 100, height: 40 } },
    });
    expect(q<HTMLElement>(".mascot").dataset.state).toBe("pointing");
    // vine din colțul din dreapta: stă în dreapta butonului, cu fața spre stânga, la mijlocul lui pe verticală
    // (mărimea de rezervă, 132×112: happy-dom nu aplică CSS-ul)
    expect(q<HTMLElement>(".mascot").style.transform).toBe("translate(504px, 264px)");
    expect(fake.faced.at(-1)).toBe("left");
    expect(q<HTMLElement>(".mascot-highlight").hidden).toBe(false);
    // conturul, cu 4px în afara butonului, ca să nu acopere textul
    expect(q<HTMLElement>(".mascot-highlight").style.transform).toBe("translate(396px, 296px)");
    expect(q<HTMLElement>(".mascot-highlight").style.width).toBe("108px");
    expect(q<HTMLElement>(".mascot-bubble").textContent).toBe("Apasă aici ca să plătești.");
  });

  test("un element sub ecran: derulează până la el", async () => {
    const { mascot } = await setup();
    const footer = document.createElement("a");
    document.body.append(footer);
    rectAt(footer, 100, 1500, 120, 30);
    footer.scrollIntoView = vi.fn(() => rectAt(footer, 100, 385, 120, 30));

    const result = await mascot.pointAt(footer, "Aici.");

    expect(footer.scrollIntoView).toHaveBeenCalledWith(expect.objectContaining({ block: "center" }));
    expect(result.ok && result.data.scrolledIntoView).toBe(true);
    expect(result.ok && result.data.rect.y).toBe(385);
  });

  test("un element sus de tot: bula trece sub mascotă, ca să nu iasă din ecran", async () => {
    const { mascot, q } = await setup();
    expect(q<HTMLElement>(".mascot").dataset.bubbleBelow).toBe("false"); // acasă, jos
    const search = document.createElement("input");
    document.body.append(search);
    rectAt(search, 370, 17, 400, 32);

    await mascot.pointAt(search, "Aici cauți alt articol.");

    expect(q<HTMLElement>(".mascot").dataset.bubbleBelow).toBe("true");
  });

  test("un element lat, cu mascota în stânga lui: bula se întinde spre dreapta, ca să nu iasă din ecran", async () => {
    const { mascot, q } = await setup();
    expect(q<HTMLElement>(".mascot").dataset.bubbleAlign).toBe("right"); // acasă, în dreapta
    rectAt(q(".mascot-bubble"), 0, 0, 264, 60); // happy-dom nu măsoară: bula are 264 px, mai lată decât mascota
    const search = document.createElement("input");
    document.body.append(search);
    rectAt(search, 200, 300, 750, 40); // nu mai e loc în dreapta lui

    await mascot.pointAt(search, "Aici cauți alt articol.");

    expect(q<HTMLElement>(".mascot").style.transform).toBe("translate(64px, 264px)");
    expect(q<HTMLElement>(".mascot").dataset.bubbleAlign).toBe("left");
  });

  test("release ascunde conturul și o întoarce în colț", async () => {
    const { mascot, q } = await setup();
    const home = q<HTMLElement>(".mascot").style.transform;
    const button = document.createElement("button");
    document.body.append(button);
    rectAt(button, 400, 300, 100, 40);
    await mascot.pointAt(button, "Aici.");

    mascot.release();

    expect(q<HTMLElement>(".mascot-highlight").hidden).toBe(true);
    expect(q<HTMLElement>(".mascot").style.transform).toBe(home);
  });
});

describe("mersul animat nu ține point_at agățat", () => {
  let tabHidden = false;

  beforeEach(() => {
    tabHidden = false;
    Object.defineProperty(document, "hidden", { configurable: true, get: () => tabHidden });
    // Niciun cadru nu sosește, ca într-un tab din fundal: un mers care așteaptă cadre n-ar ajunge niciodată.
    vi.stubGlobal("requestAnimationFrame", () => 0);
    vi.stubGlobal("cancelAnimationFrame", () => {});
  });

  afterEach(() => {
    mascot?.destroy();
    mascot = null;
    vi.unstubAllGlobals();
    Reflect.deleteProperty(document, "hidden");
  });

  function buttonAt(x: number, y: number) {
    const button = document.createElement("button");
    document.body.append(button);
    rectAt(button, x, y, 100, 40);
    return button;
  }

  test("tab ascuns: ajunge direct la element și răspunde", async () => {
    const { mascot, q } = await setup(false);
    tabHidden = true;

    const result = await mascot.pointAt(buttonAt(400, 300), "Aici.");

    expect(result.ok).toBe(true);
    expect(q<HTMLElement>(".mascot").style.transform).toBe("translate(504px, 264px)");
    expect(q<HTMLElement>(".mascot").dataset.state).toBe("pointing");
  });

  test("tabul trece în fundal în timpul mersului: mersul se încheie la țintă", async () => {
    const { mascot, q } = await setup(false);
    const pending = mascot.pointAt(buttonAt(400, 300), "Aici.");
    expect(q<HTMLElement>(".mascot").dataset.state).toBe("walking");

    tabHidden = true;
    document.dispatchEvent(new Event("visibilitychange"));
    const result = await pending;

    expect(result.ok).toBe(true);
    expect(q<HTMLElement>(".mascot").style.transform).toBe("translate(504px, 264px)");
    expect(q<HTMLElement>(".mascot-highlight").hidden).toBe(false);
  });

  test("al doilea point_at îl întrerupe pe primul, iar amândouă răspund", async () => {
    const { mascot, q } = await setup(false);
    const first = mascot.pointAt(buttonAt(400, 300), "Primul.");
    tabHidden = true; // al doilea ajunge pe loc; primul rămăsese în mers
    const second = mascot.pointAt(buttonAt(100, 500), "Al doilea.");

    const [firstResult, secondResult] = await Promise.all([first, second]);

    expect(firstResult.ok).toBe(true);
    expect(secondResult.ok).toBe(true);
    expect(q<HTMLElement>(".mascot-bubble").textContent).toBe("Al doilea.");
    expect(q<HTMLElement>(".mascot-highlight").style.transform).toBe("translate(96px, 496px)");
  });
});
