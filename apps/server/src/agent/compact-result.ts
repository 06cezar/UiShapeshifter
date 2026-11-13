// Rezultatele mari (snapshot-ul paginii) se compactează înainte să intre în istoricul modelului (specs/05):
// mai puțini tokeni = răspuns mai rapid și mai ieftin, iar modelul vede doar ce îi trebuie ca să decidă.
// PageSnapshot e deja un rezumat (SNAPSHOT_LIMITS); aici scoatem ce nu ajută la decizie (coordonate exacte, ora).

import type { PageElement, PageRegion, PageSnapshot, ToolName, ToolResult } from "@uishapeshifter/contracts";

const round = (value: number) => Math.round(value);

function compactRegion(region: PageRegion): Record<string, unknown> {
  const { id, role, label, visible, elementCount, rect } = region;
  return {
    id,
    role,
    label,
    top: round(rect.y),
    size: `${round(rect.width)}x${round(rect.height)}`,
    elementCount,
    ...(!visible && { hidden: true }),
  };
}

function compactElement(element: PageElement): Record<string, unknown> {
  const { id, selector, tag, role, label, regionId, rect, visible, inViewport, interactive, fontPx, hiddenBy } =
    element;
  return {
    id,
    selector,
    tag,
    role,
    label,
    ...(regionId && { regionId }),
    // poziția pe verticală ajută la „bara de sus”, „coloana din dreapta”
    top: round(rect.y),
    size: `${round(rect.width)}x${round(rect.height)}`,
    ...(fontPx !== undefined && { fontPx: round(fontPx) }),
    ...(interactive && { interactive: true }),
    ...(!visible && { visible: false, ...(hiddenBy && { hiddenBy }) }),
    ...(visible && !inViewport && { offscreen: true }),
  };
}

function compactPageSnapshot(snapshot: PageSnapshot): Record<string, unknown> {
  return {
    url: snapshot.url,
    title: snapshot.title,
    viewport: snapshot.viewport,
    regions: (snapshot.regions ?? []).map(compactRegion),
    elements: (snapshot.elements ?? []).map(compactElement),
    ...(snapshot.truncated && { truncated: true }),
    recipe: snapshot.recipe,
  };
}

/** Textul rezultatului, așa cum îl vede modelul în mesajul `tool`. */
export function compactResult(name: ToolName, result: ToolResult): string {
  if (result.ok && name === "get_page_snapshot" && result.data && typeof result.data === "object") {
    return JSON.stringify({ ok: true, data: compactPageSnapshot(result.data as PageSnapshot) });
  }
  return JSON.stringify(result);
}
