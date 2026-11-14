import { describe, expect, it } from "vitest";
import { effectiveScope, requestedScope } from "./scope";

describe("requestedScope: cât de larg a cerut omul", () => {
  it("fără nicio mențiune, doar pagina de acum", () => {
    expect(requestedScope("ascunde bara din dreapta")).toBe("page");
    expect(requestedScope("fă textul mai mare")).toBe("page");
    expect(requestedScope("")).toBe("page");
  });

  it("tot site-ul, spus în mai multe feluri", () => {
    expect(requestedScope("ascunde Shorts pe tot site-ul")).toBe("site");
    expect(requestedScope("pe toate paginile site-ului vreau fundal închis")).toBe("site");
    expect(requestedScope("în tot siteul")).toBe("site");
    expect(requestedScope("scoate reclamele de pe acest site")).toBe("site");
    expect(requestedScope("fă asta pe site-ul ăsta")).toBe("site");
    expect(requestedScope("pe intregul site")).toBe("site");
    expect(requestedScope("fă-l mai mare pe site")).toBe("site");
    expect(requestedScope("ca pe site-urile de știri")).toBe("page"); // nu cere un loc, doar descrie
  });

  it("toate site-urile, doar când omul o spune limpede", () => {
    expect(requestedScope("fă textul mai mare pe toate site-urile")).toBe("all");
    expect(requestedScope("vreau asta pe toate paginile")).toBe("all");
    expect(requestedScope("ascunde rezumatele AI peste tot")).toBe("all");
    expect(requestedScope("oriunde intru, fără clipuri scurte")).toBe("all");
    expect(requestedScope("și pe celelalte site-uri")).toBe("all");
    expect(requestedScope("pe orice site")).toBe("all");
  });

  it("merge fără diacritice și cu majuscule", () => {
    expect(requestedScope("PE TOATE SITE-URILE")).toBe("all");
    expect(requestedScope("pe tot site-ul")).toBe("site");
    expect(requestedScope("Ascunde-l pe toată pagina")).toBe("page");
  });

  it("„doar aici” bate orice altă mențiune din cerere", () => {
    expect(requestedScope("doar pe pagina asta, nu pe tot site-ul")).toBe("page");
    expect(requestedScope("numai aici, nu peste tot")).toBe("page");
  });
});

describe("effectiveScope: agentul nu lărgește ce a cerut omul", () => {
  it("fără alegerea agentului, cât a cerut omul", () => {
    expect(effectiveScope("pe toate site-urile")).toBe("all");
    expect(effectiveScope("ascunde bara")).toBe("page");
  });

  it("agentul poate alege mai îngust, nu mai larg", () => {
    expect(effectiveScope("ascunde bara", "all")).toBe("page");
    expect(effectiveScope("pe tot site-ul", "all")).toBe("site");
    expect(effectiveScope("pe toate site-urile", "site")).toBe("site");
    expect(effectiveScope("pe toate site-urile", "all")).toBe("all");
  });
});
