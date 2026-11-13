import { describe, expect, it } from "vitest";
import type { PageSnapshot } from "@uishapeshifter/contracts";
import { createFakeDecider, findElements, requestRoots } from "./fake-decider";
import { pageElement, pageSnapshot } from "./page-snapshot.fixture";

const ads = pageSnapshot({
  elements: [
    pageElement({ id: "e.1", label: "Căutare", selector: "form[role='search']" }),
    pageElement({ id: "e.2", label: "Sponsorizat: Mobilă la reducere", selector: "aside.ad-1" }),
    pageElement({ id: "e.3", label: "Publicitate", selector: "div.ad-2" }),
    pageElement({ id: "e.4", label: "Vino aici pentru oferte", selector: "a.promo-link" }),
    pageElement({ id: "e.5", label: "Rezumat AI", selector: "div[aria-label='Rezumat AI']" }),
  ],
});

const snapshotStep = (data: PageSnapshot) =>
  ({ name: "get_page_snapshot", args: {}, result: { ok: true, data } }) as const;

describe("findElements", () => {
  it("găsește după rădăcină și fără diacritice: „știrile” → „Știri pentru tine”", () => {
    const snapshot = pageSnapshot({
      elements: [pageElement({ id: "e.9", label: "Știri pentru tine", selector: "aside.stiri" })],
    });
    expect(findElements(snapshot, "știrile").map((e) => e.id)).toEqual(["e.9"]);
  });

  it("„reclamele” găsește toate reclamele după sinonime (Sponsorizat, Publicitate)", () => {
    expect(findElements(ads, "toate reclamele").map((e) => e.id)).toEqual(["e.2", "e.3"]);
  });

  it("o rădăcină scurtă („ai”) se potrivește doar pe cuvânt întreg: prinde „Rezumat AI”, nu „aici”", () => {
    expect(findElements(ads, "chestiile cu AI").map((e) => e.id)).toEqual(["e.5"]);
  });

  it("nu alege elemente ascunse deja", () => {
    const snapshot = pageSnapshot({
      elements: [pageElement({ id: "e.2", label: "Shorts", selector: "x", visible: false, hiddenBy: "recipe" })],
    });
    expect(findElements(snapshot, "Shorts")).toEqual([]);
  });

  it("cuvintele de umplutură nu devin rădăcini", () => {
    expect(requestRoots("toate butoanele cu reclame")).toEqual(["recla", "sponsor", "publicit", "promov", "anunt"]);
  });
});

describe("createFakeDecider", () => {
  it("„șterge reclamele”: ascunde toate reclamele într-un singur apply_css", async () => {
    const decider = createFakeDecider("Șterge reclamele.");
    expect(await decider.decide(null)).toMatchObject({ name: "get_page_snapshot" });
    expect(await decider.decide(snapshotStep(ads))).toMatchObject({
      name: "apply_css",
      args: { css: "aside.ad-1, div.ad-2 { display: none !important; }" },
    });
  });

  it("„șterge Shorts” merge ca înainte", async () => {
    const decider = createFakeDecider("șterge Shorts");
    await decider.decide(null);
    expect(await decider.decide(snapshotStep(pageSnapshot()))).toMatchObject({
      name: "apply_css",
      args: { css: "section[aria-label='Shorts'] { display: none !important; }" },
    });
  });

  it("„ascunde X” care nu e pe pagină: spune omului și închide cu success: false", async () => {
    const decider = createFakeDecider("ascunde calendarul");
    await decider.decide(null);
    expect(await decider.decide(snapshotStep(pageSnapshot()))).toMatchObject({ name: "say" });
    expect(await decider.decide({ name: "say", args: {}, result: { ok: true, data: { shown: true } } })).toMatchObject({
      name: "finish",
      args: { success: false },
    });
  });

  it("dacă un element se vede încă după apply_css, nu pretinde că a reușit", async () => {
    const decider = createFakeDecider("Ascunde Shorts.");
    await decider.decide(null);
    await decider.decide(snapshotStep(pageSnapshot()));
    await decider.decide({
      name: "apply_css",
      args: {},
      result: { ok: true, data: { revision: 1, cssBytes: 10, dropped: [], unmatchedSelectors: [] } },
    });
    expect(await decider.decide(snapshotStep(pageSnapshot()))).toMatchObject({
      name: "finish",
      args: { success: false },
    });
  });

  it("altă cerere: îi spune omului ce știe modul de probă", async () => {
    const decider = createFakeDecider("fă site-ul albastru");
    await decider.decide(null);
    expect(await decider.decide(snapshotStep(pageSnapshot()))).toMatchObject({ name: "say" });
  });
});

describe("createFakeDecider, etapa 2", () => {
  it("după verificare: audit_ui → propose_changes; „undo” → spune că a lăsat pagina cum era", async () => {
    const decider = createFakeDecider("ascunde Shorts", 0, 2);
    await decider.decide(null);
    await decider.decide(snapshotStep(pageSnapshot()));
    await decider.decide({
      name: "apply_css",
      args: {},
      result: { ok: true, data: { revision: 1, cssBytes: 10, dropped: [], unmatchedSelectors: [] } },
    });
    const hidden = pageSnapshot({
      elements: [pageElement({ id: "e.2", label: "Shorts", selector: "x", visible: false, hiddenBy: "recipe" })],
    });
    expect(await decider.decide(snapshotStep(hidden))).toMatchObject({ name: "audit_ui" });
    expect(
      await decider.decide({
        name: "audit_ui",
        args: {},
        result: { ok: true, data: { ok: true, score: 96, issues: [] } },
      }),
    ).toMatchObject({
      name: "propose_changes",
      args: { summary: "Am ascuns „Shorts”. Rămân ascunse și data viitoare." },
    });
    expect(
      await decider.decide({
        name: "propose_changes",
        args: {},
        result: { ok: true, data: { proposalId: "p", decision: "undo", revision: 0 } },
      }),
    ).toMatchObject({ name: "finish", args: { summary: "Am lăsat pagina cum era, cum ai ales." } });
  });
});
