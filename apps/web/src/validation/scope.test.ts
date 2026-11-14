import { describe, expect, it } from "vitest";
import { effectiveScope, requestedScope } from "./scope";

describe("requestedScope: cât de larg a cerut omul", () => {
  it("fără nicio mențiune, tot site-ul (ca rețeta de azi, specs/01)", () => {
    expect(requestedScope("ascunde bara din dreapta")).toBe("site");
    expect(requestedScope("nu vreau Shorts")).toBe("site"); // pe tot YouTube-ul, nu doar pe pagina de acum
    expect(requestedScope("scoate tot ce e AI")).toBe("site");
    expect(requestedScope("")).toBe("site");
  });

  it("doar pagina de acum, numai când omul o spune", () => {
    expect(requestedScope("ascunde bara doar aici")).toBe("page");
    expect(requestedScope("doar pe pagina asta")).toBe("page");
  });

  it("tot site-ul, spus în mai multe feluri", () => {
    expect(requestedScope("ascunde Shorts pe tot site-ul")).toBe("site");
    expect(requestedScope("pe toate paginile site-ului vreau fundal închis")).toBe("site");
    expect(requestedScope("în tot siteul")).toBe("site");
    expect(requestedScope("scoate reclamele de pe acest site")).toBe("site");
    expect(requestedScope("fă asta pe site-ul ăsta")).toBe("site");
    expect(requestedScope("pe intregul site")).toBe("site");
    expect(requestedScope("fă-l mai mare pe site")).toBe("site");
    expect(requestedScope("ca pe site-urile de știri")).toBe("site"); // descrie, nu cere toate site-urile
  });

  it("toate site-urile, doar când omul o spune limpede", () => {
    expect(requestedScope("fă textul mai mare pe toate site-urile")).toBe("all");
    expect(requestedScope("vreau asta pe toate paginile")).toBe("all");
    expect(requestedScope("ascunde rezumatele AI peste tot")).toBe("all");
    expect(requestedScope("oriunde intru, fără clipuri scurte")).toBe("all");
    expect(requestedScope("și pe celelalte site-uri")).toBe("all");
    expect(requestedScope("pe orice site")).toBe("all");
    expect(requestedScope("nu vreau Shorts nicăieri")).toBe("all");
    expect(requestedScope("nu vreau rezumate AI pe niciun site")).toBe("all");
    expect(requestedScope("nu vreau AI în site-uri")).toBe("all"); // exemplul din specs/08 (găsit de B pe #64)
  });

  it("merge fără diacritice și cu majuscule", () => {
    expect(requestedScope("PE TOATE SITE-URILE")).toBe("all");
    expect(requestedScope("pe tot site-ul")).toBe("site");
    expect(requestedScope("Ascunde-l DOAR AICI")).toBe("page");
  });

  it("„doar aici” bate orice altă mențiune din cerere", () => {
    expect(requestedScope("doar pe pagina asta, nu pe tot site-ul")).toBe("page");
    expect(requestedScope("numai aici, nu peste tot")).toBe("page");
  });

  it("„nu doar aici” spune invers: nu se socotește ca „doar aici” (găsit de B pe #64)", () => {
    expect(requestedScope("fă textul mai mare pe toate site-urile, nu doar aici")).toBe("all");
    expect(requestedScope("nu numai pe pagina asta, pe tot site-ul")).toBe("site");
  });
});

describe("effectiveScope: agentul nu lărgește ce a cerut omul", () => {
  it("fără alegerea agentului, cât a cerut omul", () => {
    expect(effectiveScope("pe toate site-urile")).toBe("all");
    expect(effectiveScope("ascunde bara")).toBe("site");
  });

  it("agentul poate alege mai îngust, nu mai larg", () => {
    expect(effectiveScope("ascunde bara", "all")).toBe("site");
    expect(effectiveScope("ascunde bara doar aici", "site")).toBe("page");
    expect(effectiveScope("pe tot site-ul", "all")).toBe("site");
    expect(effectiveScope("pe toate site-urile", "site")).toBe("site");
    expect(effectiveScope("pe toate site-urile", "all")).toBe("all");
  });
});
