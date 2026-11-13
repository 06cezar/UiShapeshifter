import { act, useEffect } from "react";
import { createRoot } from "react-dom/client";
import { describe, expect, it } from "vitest";
import { createConfigStore } from "./config-store";
import type { ChangeMeta } from "./config-store";
import { fakeContrast, NORMAL_THRESHOLDS } from "./test-fixtures";
import { bindThemeToRoot } from "./theme-sync";

const USER: ChangeMeta = { by: "user", reason: "test" };

function newStore() {
  return createConfigStore({ contrastRatio: fakeContrast(), thresholds: NORMAL_THRESHOLDS });
}

describe("bindThemeToRoot", () => {
  it("scrie variabilele la pornire și le actualizează după un patch", () => {
    const store = newStore();
    const root = document.createElement("div");
    bindThemeToRoot(store, root);
    expect(root.style.getPropertyValue("--font-base")).toBe("16px");
    expect(root.style.getPropertyValue("--color-primary")).toBe("#C2410C");

    store.getState().applyPatch([{ op: "replace", path: "/theme/baseFontPx", value: 20 }], USER);
    expect(root.style.getPropertyValue("--font-base")).toBe("20px");
    expect(root.style.getPropertyValue("--font-step-1")).toBe("25px");

    store.getState().applyPatch([{ op: "replace", path: "/minTargetPx", value: 56 }], USER);
    expect(root.style.getPropertyValue("--min-target")).toBe("56px");
  });

  it("după dezabonare nu mai scrie nimic", () => {
    const store = newStore();
    const root = document.createElement("div");
    const unbind = bindThemeToRoot(store, root);
    unbind();
    store.getState().applyPatch([{ op: "replace", path: "/theme/baseFontPx", value: 20 }], USER);
    expect(root.style.getPropertyValue("--font-base")).toBe("16px");
  });

  it("schimbarea temei nu re-montează și nu re-randează componentele", async () => {
    const store = newStore();
    const root = document.createElement("div");
    bindThemeToRoot(store, root);
    let mounts = 0;
    let renders = 0;
    function Probe() {
      renders++;
      useEffect(() => {
        mounts++;
      }, []);
      return <p style={{ fontSize: "var(--font-base)" }}>text</p>;
    }
    const container = document.createElement("div");
    root.appendChild(container);
    await act(async () => createRoot(container).render(<Probe />));
    const rendersAfterMount = renders;

    await act(async () => {
      for (const value of [18, 20, 24]) {
        store.getState().applyPatch([{ op: "replace", path: "/theme/baseFontPx", value }], USER);
      }
    });
    expect(root.style.getPropertyValue("--font-base")).toBe("24px");
    expect(mounts).toBe(1);
    expect(renders).toBe(rendersAfterMount);
  });
});
