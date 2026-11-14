// Modul expert (run_js): oprit implicit, codul învelit ca să întoarcă rezultatul sau eroarea, textul tăiat la limită.

import { describe, expect, test } from "vitest";
import { RUN_JS_LIMITS } from "@uishapeshifter/contracts";
import { EXPERT_MODE_KEY, isExpertMode, runJsDataFrom, setExpertMode, wrapCode } from "./expert-mode";

function memory(initial: Record<string, unknown> = {}) {
  const data = { ...initial };
  return {
    get: async (k: string) => ({ [k]: data[k] }),
    set: async (i: Record<string, unknown>) => void Object.assign(data, i),
  };
}

describe("modul expert", () => {
  test("oprit implicit; pornit doar explicit", async () => {
    const storage = memory();
    expect(await isExpertMode(storage)).toBe(false);
    await setExpertMode(storage, true);
    expect(await isExpertMode(storage)).toBe(true);
    expect(await isExpertMode(memory({ [EXPERT_MODE_KEY]: "da" }))).toBe(false);
  });

  test("codul învelit întoarce valoarea sau eroarea", async () => {
    // ca userScripts.execute: rezultatul e valoarea ultimei instrucțiuni a scriptului (eval indirect, doar în test)
    const run = (code: string) => (0, eval)(wrapCode(code)) as Promise<unknown>;
    expect(await run("return 1 + 2;")).toBe(3);
    expect(runJsDataFrom(await run("throw new Error('nu merge')"))).toEqual({ status: "ran", error: "nu merge" });
  });

  test("al doilea strat: rețeaua, cookie-urile, stocarea și adresele noi sunt oprite; citirea paginii merge", async () => {
    document.body.innerHTML = `<a href="https://site.example/plata">Plătește</a><img id="poza" src="https://site.example/a.png">`;
    const run = async (code: string) => runJsDataFrom(await ((0, eval)(wrapCode(code)) as Promise<unknown>));
    expect(await run(`return window["fe" + "tch"]`)).toMatchObject({
      error: expect.stringMatching(/fetch nu e permis/),
    });
    expect(await run(`return document["coo" + "kie"]`)).toMatchObject({
      error: expect.stringMatching(/cookie nu e permis/),
    });
    expect(await run(`return localStorage.getItem("x")`)).toMatchObject({
      error: expect.stringMatching(/localStorage/),
    });
    expect(await run(`document.getElementById("poza").src = "https://rau.example/?d=1"`)).toMatchObject({
      error: expect.stringMatching(/src nu e permis/),
    });
    expect(await run(`document.querySelector("a").setAttribute("href", "https://rau.example")`)).toMatchObject({
      error: expect.stringMatching(/href nu e permis/),
    });
    expect(
      await run(`return document.querySelector("a").textContent + " " + document.querySelectorAll("img").length`),
    ).toEqual({ status: "ran", result: "Plătește 1" });
  });

  test("rezultatul ajunge la agent ca text, tăiat la limită", () => {
    expect(runJsDataFrom({ gasite: 3 })).toEqual({ status: "ran", result: '{"gasite":3}' });
    expect(runJsDataFrom(undefined)).toEqual({ status: "ran" });
    expect(runJsDataFrom("x".repeat(RUN_JS_LIMITS.maxResultChars + 50)).result?.length).toBe(
      RUN_JS_LIMITS.maxResultChars + 1,
    );
    expect(runJsDataFrom(undefined, "Cannot access")).toEqual({ status: "ran", error: "Cannot access" });
  });
});
