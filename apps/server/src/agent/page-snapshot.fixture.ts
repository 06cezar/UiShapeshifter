// Un snapshot de pagină mic, pentru teste: un site de video cu un raft „Shorts”. Doar date de test.

import type { PageElement, PageSnapshot } from "@uishapeshifter/contracts";

export function pageElement(
  overrides: Partial<PageElement> & Pick<PageElement, "id" | "label" | "selector">,
): PageElement {
  return {
    tag: "div",
    role: "region",
    rect: { x: 0, y: 200, width: 800, height: 240 },
    visible: true,
    inViewport: true,
    interactive: false,
    ...overrides,
  };
}

export function pageSnapshot(overrides: Partial<PageSnapshot> = {}): PageSnapshot {
  return {
    url: "https://video.example/",
    host: "video.example",
    title: "Video de test",
    viewport: { width: 1280, height: 800 },
    regions: [
      {
        id: "r.main",
        selector: "main",
        role: "main",
        label: "Recomandări",
        rect: { x: 0, y: 80, width: 1280, height: 2000 },
        visible: true,
        elementCount: 2,
      },
    ],
    elements: [
      pageElement({ id: "e.1", label: "Căutare", selector: "form[role='search']", tag: "form", role: "search" }),
      pageElement({ id: "e.2", label: "Shorts", selector: "section[aria-label='Shorts']", regionId: "r.main" }),
    ],
    truncated: false,
    recipe: { revision: 0, css: "" },
    takenAt: "2026-11-13T19:00:00.000Z",
    ...overrides,
  };
}
