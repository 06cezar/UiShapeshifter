// Preferințele de aspect „peste tot”: CSS-ul din profil ajunge pe orice site, validat, fără AI.

import { describe, expect, test } from "vitest";
import { genericPreferenceCss } from "@uishapeshifter/contracts";
import { applyGeneralStyle, generalCssFrom, GENERAL_STYLE_ID } from "./general-style";

const pref = (css?: string) => ({
  id: "verde",
  text: "fundal verde",
  source: "conversation",
  evidence: ["x"],
  createdAt: "x",
  appliedOn: [],
  ...(css ? { css } : {}),
});

describe("preferințele de aspect peste tot", () => {
  test("din fiecare regulă rămân selectorii generici; clasele, id-urile, atributele și combinațiile cad", () => {
    const css =
      "html, body, body > div:nth-of-type(4), #main-container { background: pink } .ad { display: none } a:hover, a[href] { color: red }";
    expect(genericPreferenceCss(css)).toBe("html, body { background: pink }\na:hover { color: red }");
  });

  test("din profilul local: doar preferințele cu CSS", () => {
    const stored = {
      userId: "u-1",
      "u-1": { generalPreferences: [pref("body { background: #2e7d32 !important; }"), pref()] },
    };
    expect(generalCssFrom(stored, "userId")).toBe("body { background: #2e7d32 !important; }");
    expect(generalCssFrom({ userId: "u-1" }, "userId")).toBe("");
  });

  test("foaia apare o singură dată, fără cod, și pleacă fără preferințe", () => {
    applyGeneralStyle("body { background: #2e7d32 !important; }");
    applyGeneralStyle("body { background: #2e7d32 !important; }");
    expect(document.querySelectorAll(`#${GENERAL_STYLE_ID}`)).toHaveLength(1);
    expect(document.getElementById(GENERAL_STYLE_ID)?.textContent).toContain("#2e7d32");
    applyGeneralStyle("body { background: url(https://rau.example/x.png); }");
    expect(document.getElementById(GENERAL_STYLE_ID)?.textContent ?? "").not.toContain("url(");
    applyGeneralStyle("");
    expect(document.getElementById(GENERAL_STYLE_ID)).toBeNull();
  });
});
