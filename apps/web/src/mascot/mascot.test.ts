import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { HOST_ID, mountOurRoot } from "../extension/shadow-root";
import type { SpriteAnimation } from "./animations";
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

async function setup() {
  document.getElementById(HOST_ID)?.remove();
  const fake = fakeRenderer();
  mascot = mountMascot(mountOurRoot(document), {
    reducedMotion: () => true, // fără mers animat: poziția se schimbă pe loc, testul nu așteaptă cadre
    createRenderer: async () => fake.renderer,
  });
  await Promise.resolve(); // randarea falsă se creează asincron, ca modelul adevărat
  const shadow = document.getElementById(HOST_ID)!.shadowRoot!;
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
    expect(fake.played.at(-1)).toBe("jump");
  });
});

describe("bula", () => {
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
    // (mărimea de rezervă, 99×99: happy-dom nu aplică CSS-ul)
    expect(q<HTMLElement>(".mascot").style.transform).toBe("translate(504px, 271px)");
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
