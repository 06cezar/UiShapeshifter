// Elementele adăugate de agent (B3, specs/03): insertHtml, inject, bind, în motorul de rețete adevărat.

import { afterEach, describe, expect, test, vi } from "vitest";
import { createRecipeEngine, type RecipeEngine } from "./recipe-engine";
import { loadRecipe, type RecipeStorage } from "./recipe-store";
import { GEN_ROOT_ATTR, pageComponentProblem } from "../../generated/page-components";

function memoryStorage(): RecipeStorage & { data: Record<string, unknown> } {
  const data: Record<string, unknown> = {};
  return {
    data,
    async get(keys) {
      const list = Array.isArray(keys) ? keys : [keys];
      return Object.fromEntries(list.filter((k) => k in data).map((k) => [k, structuredClone(data[k])]));
    },
    async set(items) {
      Object.assign(data, structuredClone(items));
    },
    async remove(keys) {
      for (const key of Array.isArray(keys) ? keys : [keys]) delete data[key];
    },
  };
}

const engines: RecipeEngine[] = [];
afterEach(() => {
  engines.splice(0).forEach((engine) => engine.dispose());
  document.body.innerHTML = "";
  document.head.innerHTML = "";
});

/** Pagina de test: factura curentă cu „Plătește” ascuns într-un meniu, ca pe site-ul de test (E7). */
const PAGE =
  '<main id="main"><h1>Contul meu</h1><details class="more"><summary>⋯</summary>' +
  '<a class="pay" href="/plata">Plătește factura</a></details></main>';

async function engineOn(options: { askAgent?: (goal: string) => void; storage?: RecipeStorage } = {}) {
  document.body.innerHTML = PAGE;
  const storage = options.storage ?? memoryStorage();
  const engine = createRecipeEngine({ host: "test.ro", storage, askAgent: options.askAgent });
  engines.push(engine);
  await engine.load();
  return { engine, storage };
}

const PAY_SHORTCUT = {
  op: "inject",
  id: "pay-shortcut",
  component: {
    id: "pay",
    type: "shortcut",
    props: { label: "Plătește factura", icon: "send", size: "xl", tone: "primary" },
    action: { kind: "click", selector: "a.pay" },
  },
  at: { selector: "main", position: "prepend" },
};

describe("inject: o componentă din catalog", () => {
  test("scurtătura „Plătește factura” apare sus, cu tema noastră, și apasă butonul real", async () => {
    const { engine } = await engineOn();
    const realClick = vi.fn((event: Event) => event.preventDefault());
    document.querySelector("a.pay")!.addEventListener("click", realClick);

    const result = await engine.applyOps({ ops: [PAY_SHORTCUT], reason: "omul vrea doar să plătească" });
    expect(result).toMatchObject({ ok: true, data: { applied: 1, skipped: [] } });

    const root = document.querySelector<HTMLElement>('[data-shape="pay-shortcut"]')!;
    expect(document.getElementById("main")!.firstElementChild).toBe(root);
    expect(root.hasAttribute(GEN_ROOT_ATTR)).toBe(true);
    expect(root.style.getPropertyValue("--min-target")).not.toBe(""); // tema noastră, nu culori scrise de mână
    const button = root.querySelector<HTMLButtonElement>('[data-agent-id="gen.pay"]')!;
    expect(button.getAttribute("aria-label")).toBe("Plătește factura");
    button.click();
    expect(realClick).toHaveBeenCalledTimes(1);
  });

  test("askAgent pornește agentul cu scopul cerut", async () => {
    const askAgent = vi.fn();
    const { engine } = await engineOn({ askAgent });
    await engine.applyOps({
      ops: [
        {
          op: "inject",
          id: "help",
          component: {
            id: "help-btn",
            type: "button",
            props: { label: "Ajută-mă" },
            action: { kind: "askAgent", goal: "Ajută-mă să plătesc factura" },
          },
          at: { selector: "main", position: "append" },
        },
      ],
      reason: "x",
    });
    document.querySelector<HTMLButtonElement>('[data-agent-id="gen.help-btn"]')!.click();
    expect(askAgent).toHaveBeenCalledWith("Ajută-mă să plătesc factura");
  });

  test.each([
    [{ id: "x", type: "image", props: { src: "https://evil.example/a.png" } }, "type"],
    [{ id: "x", type: "button", props: {} }, "label"],
    [{ id: "x", type: "text", props: { text: "x".repeat(121) } }, "120"],
    [
      { id: "x", type: "button", props: { label: "Du-te" }, action: { kind: "navigate", path: "//evil.example" } },
      "„/”",
    ],
    [
      { id: "x", type: "button", props: { label: "x" }, action: { kind: "click", selector: "#uishapeshifter-root" } },
      "interfața",
    ],
    [{ id: "x", type: "text", props: { text: "x" }, action: { kind: "askAgent", goal: "x" } }, "Doar button"],
    [{ id: "x", type: "text", props: { text: "x", onclick: "alert(1)" } }, "nu e permis"],
  ])("componentă respinsă: %j", (component, message) => {
    expect(pageComponentProblem(component, document)).toContain(message);
  });

  test("prea adâncă sau prea mare", () => {
    let deep: Record<string, unknown> = { id: "leaf", type: "text", props: { text: "x" } };
    for (let i = 0; i < 5; i++) deep = { id: `s${i}`, type: "stack", children: [deep] };
    expect(pageComponentProblem(deep, document)).toContain("adâncă");
    const wide = {
      id: "g",
      type: "grid",
      children: Array.from({ length: 31 }, (_, i) => ({ id: `t${i}`, type: "divider" })),
    };
    expect(pageComponentProblem(wide, document)).toContain("noduri");
  });
});

describe("insertHtml: HTML scris de agent, curățat", () => {
  test("se inserează forma validată; ce nu e voie se scoate și apare în htmlDropped", async () => {
    const { engine } = await engineOn();
    const result = await engine.applyOps({
      ops: [
        {
          op: "insertHtml",
          id: "pasi",
          html: '<section class="pasi"><h2>Trei pași</h2><p onclick="alert(1)">Deschide factura</p><img src="x"></section>',
          at: { selector: "h1", position: "after" },
        },
      ],
      reason: "pașii",
    });
    expect(result.ok && result.data.applied).toBe(1);
    expect(result.ok && result.data.htmlDropped.map((d) => d.reason)).toEqual(["attribute", "tag"]); // în ordinea din document
    const added = document.querySelector('[data-shape="pasi"]')!;
    expect(added.innerHTML).toBe('<section class="pasi"><h2>Trei pași</h2><p>Deschide factura</p></section>');
    expect(document.querySelector("h1")!.nextElementSibling).toBe(added);
  });

  test("un link javascript: respinge operația întreagă (specs/03)", async () => {
    const { engine } = await engineOn();
    const result = await engine.applyOps({
      ops: [
        {
          op: "insertHtml",
          id: "rau",
          html: '<a href="javascript:alert(1)">x</a>',
          at: { selector: "main", position: "append" },
        },
      ],
      reason: "x",
    });
    expect(result.ok && result.data.skipped[0]).toMatchObject({ index: 0, reason: "INVALID" });
    expect(result.ok && result.data.htmlDropped[0]?.reason).toBe("href");
    expect(document.querySelector('[data-shape="rau"]')).toBeNull();
  });
});

describe("bind: un element adăugat apasă unul real", () => {
  test("butonul adăugat cu HTML apasă „Plătește” din meniu; un <a> adăugat nu mai navighează singur", async () => {
    const { engine } = await engineOn();
    const realClick = vi.fn((event: Event) => event.preventDefault());
    document.querySelector("a.pay")!.addEventListener("click", realClick);
    const result = await engine.applyOps({
      ops: [
        {
          op: "insertHtml",
          id: "plata-rapida",
          html: '<a href="/alt">Plătește acum</a>',
          at: { selector: "main", position: "prepend" },
        },
        { op: "bind", from: "plata-rapida", to: "a.pay" },
      ],
      reason: "scurtătură",
    });
    expect(result.ok && result.data.applied).toBe(2);
    const link = document.querySelector<HTMLAnchorElement>('[data-shape="plata-rapida"] a')!;
    const navigation = new MouseEvent("click", { bubbles: true, cancelable: true });
    link.dispatchEvent(navigation);
    expect(realClick).toHaveBeenCalledTimes(1);
    expect(navigation.defaultPrevented).toBe(true);
  });

  test("un buton legat de mai multe linkuri le apasă pe toate, pe rând („Descarcă toate facturile”)", async () => {
    vi.useFakeTimers();
    try {
      const { engine } = await engineOn();
      const main = document.querySelector("main")!;
      const clicked: string[] = [];
      for (const name of ["f1", "f2", "f3"]) {
        const link = document.createElement("a");
        link.className = "factura";
        link.textContent = name;
        link.addEventListener("click", (event) => {
          event.preventDefault();
          clicked.push(name);
        });
        main.append(link);
      }
      const result = await engine.applyOps({
        ops: [
          {
            op: "insertHtml",
            id: "toate",
            html: "<button>Descarcă toate</button>",
            at: { selector: "main", position: "prepend" },
          },
          { op: "bind", from: "toate", to: "a.factura", all: true },
        ],
        reason: "descarcă toate",
      });
      expect(result.ok && result.data.applied).toBe(2);
      document.querySelector<HTMLButtonElement>('[data-shape="toate"] button')!.click();
      expect(clicked).toEqual(["f1"]);
      vi.runAllTimers();
      expect(clicked).toEqual(["f1", "f2", "f3"]);
    } finally {
      vi.useRealTimers();
    }
  });

  test("bind fără all pe un selector care prinde mai multe elemente e respins, cu sfatul pentru all", async () => {
    const { engine } = await engineOn();
    const main = document.querySelector("main")!;
    for (const name of ["f1", "f2"]) {
      const link = document.createElement("a");
      link.className = "factura";
      link.textContent = name;
      main.append(link);
    }
    const result = await engine.applyOps({
      ops: [
        {
          op: "insertHtml",
          id: "toate",
          html: "<button>Toate</button>",
          at: { selector: "main", position: "prepend" },
        },
        { op: "bind", from: "toate", to: "a.factura" },
      ],
      reason: "x",
    });
    const skipped = result.ok ? result.data.skipped[0] : undefined;
    expect(skipped?.reason).toBe("SELECTOR_AMBIGUOUS");
    expect(skipped?.message).toContain("all: true");
  });

  test("bind nu apasă și butonul adăugat, chiar dacă selectorul îl prinde (altfel s-ar apăsa la nesfârșit)", async () => {
    vi.useFakeTimers();
    try {
      const { engine } = await engineOn();
      const main = document.querySelector("main")!;
      let realClicks = 0;
      const real = document.createElement("button");
      real.textContent = "real";
      real.addEventListener("click", () => realClicks++);
      main.append(real);
      const result = await engine.applyOps({
        ops: [
          {
            op: "insertHtml",
            id: "toate",
            html: "<button>Toate</button>",
            at: { selector: "main", position: "append" },
          },
          { op: "bind", from: "toate", to: "main button", all: true },
        ],
        reason: "descarcă toate",
      });
      expect(result.ok && result.data.applied).toBe(2);
      document.querySelector<HTMLButtonElement>('[data-shape="toate"] button')!.click();
      vi.runAllTimers();
      expect(realClicks).toBe(1);
      expect(vi.getTimerCount()).toBe(0);
    } finally {
      vi.useRealTimers();
    }
  });

  test("bind spre un selector care prinde doar ce am adăugat noi e respins", async () => {
    const { engine } = await engineOn();
    const result = await engine.applyOps({
      ops: [
        { op: "insertHtml", id: "doar-al-nostru", html: "<em>x</em>", at: { selector: "main", position: "append" } },
        { op: "bind", from: "doar-al-nostru", to: '[data-shape="doar-al-nostru"] em' },
      ],
      reason: "x",
    });
    expect(result.ok && result.data.skipped[0]?.reason).toBe("SELECTOR_NOT_FOUND");
  });

  test("bind spre un id care nu a fost adăugat e respins, cu motiv", async () => {
    const { engine } = await engineOn();
    const result = await engine.applyOps({ ops: [{ op: "bind", from: "nu-exista", to: "a.pay" }], reason: "x" });
    expect(result.ok && result.data.skipped[0]?.message).toContain("trebuie să fie id-ul unui element adăugat");
  });
});

describe("rețeta: reîncărcare și Anulez", () => {
  test("după reîncărcare scurtătura apare din nou, fără server; Anulez o scoate", async () => {
    const storage = memoryStorage();
    const { engine } = await engineOn({ storage });
    await engine.applyOps({ ops: [PAY_SHORTCUT], reason: "x" });
    expect((await loadRecipe(storage, "test.ro", "now")).recipe.ops).toHaveLength(1);

    const { engine: reloaded } = await engineOn({ storage }); // pagină nouă, motor nou
    expect(document.querySelectorAll('[data-shape="pay-shortcut"]')).toHaveLength(1);
    await reloaded.revertTo(0);
    expect(document.querySelector('[data-shape="pay-shortcut"]')).toBeNull();
    expect(engine).toBeDefined();
  });
});
