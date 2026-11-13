import { describe, expect, it } from "vitest";
import { createFakeDecider, findElement } from "./fake-decider";
import { pageElement, pageSnapshot } from "./page-snapshot.fixture";

describe("findElement", () => {
  it("găsește elementul după text, fără să conteze diacriticele și majusculele", () => {
    const snapshot = pageSnapshot({
      elements: [pageElement({ id: "e.9", label: "Știri pentru tine", selector: "aside.stiri" })],
    });
    expect(findElement(snapshot, "stiri")?.id).toBe("e.9");
  });

  it("nu alege elemente ascunse deja", () => {
    const snapshot = pageSnapshot({
      elements: [pageElement({ id: "e.2", label: "Shorts", selector: "x", visible: false, hiddenBy: "recipe" })],
    });
    expect(findElement(snapshot, "Shorts")).toBeUndefined();
  });
});

describe("createFakeDecider", () => {
  it("„ascunde X” care nu e pe pagină: spune omului și închide cu success: false", async () => {
    const decider = createFakeDecider("ascunde reclamele");
    expect(await decider.decide(null)).toMatchObject({ name: "get_page_snapshot" });
    const said = await decider.decide({
      name: "get_page_snapshot",
      args: {},
      result: { ok: true, data: pageSnapshot() },
    });
    expect(said).toMatchObject({ name: "say" });
    expect(await decider.decide({ name: "say", args: {}, result: { ok: true, data: { shown: true } } })).toMatchObject({
      name: "finish",
      args: { success: false },
    });
  });

  it("dacă elementul se vede încă după apply_css, nu pretinde că a reușit", async () => {
    const decider = createFakeDecider("Ascunde Shorts.");
    await decider.decide(null);
    await decider.decide({ name: "get_page_snapshot", args: {}, result: { ok: true, data: pageSnapshot() } });
    await decider.decide({
      name: "apply_css",
      args: {},
      result: { ok: true, data: { revision: 1, cssBytes: 10, dropped: [], unmatchedSelectors: [] } },
    });
    const stillThere = pageSnapshot(); // „Shorts” încă vizibil
    expect(
      await decider.decide({ name: "get_page_snapshot", args: {}, result: { ok: true, data: stillThere } }),
    ).toMatchObject({ name: "finish", args: { success: false } });
  });

  it("altă cerere: îi spune omului ce știe modul de probă", async () => {
    const decider = createFakeDecider("fă site-ul albastru");
    await decider.decide(null);
    expect(
      await decider.decide({ name: "get_page_snapshot", args: {}, result: { ok: true, data: pageSnapshot() } }),
    ).toMatchObject({
      name: "say",
    });
  });
});
