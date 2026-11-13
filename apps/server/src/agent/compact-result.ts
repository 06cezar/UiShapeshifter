// Rezultatele mari (snapshot-ul) se compactează înainte să intre în istoricul modelului (specs/05):
// mai puțini tokeni = răspuns mai rapid și mai ieftin, iar modelul vede doar ce îi trebuie ca să decidă.

import type { ElementInfo, ToolName, ToolResult, UISnapshot } from "@uishapeshifter/contracts";

const MAX_ELEMENTS = 80;

function compactElement(element: ElementInfo): Record<string, unknown> {
  const { id, role, label, rect, visible, inViewport, fontPx, contrast, clipped } = element;
  return {
    id,
    role,
    label,
    size: `${Math.round(rect.width)}x${Math.round(rect.height)}`,
    ...(fontPx !== undefined && { fontPx: Math.round(fontPx * 10) / 10 }),
    ...(contrast !== undefined && { contrast: Math.round(contrast * 100) / 100 }),
    ...(!visible && { hidden: true }),
    ...(visible && !inViewport && { offscreen: true }),
    ...(clipped && { clipped: true }),
  };
}

function compactSnapshot(snapshot: UISnapshot): Record<string, unknown> {
  const elements = Array.isArray(snapshot.elements) ? snapshot.elements : [];
  // întâi ce se poate apăsa și ce se vede: acolo acționează agentul
  const ranked = [...elements].sort(
    (a, b) => Number(b.interactive) - Number(a.interactive) || Number(b.visible) - Number(a.visible),
  );
  return {
    route: snapshot.route,
    configRevision: snapshot.configRevision,
    viewport: snapshot.viewport,
    openOverlays: snapshot.openOverlays,
    elements: ranked.slice(0, MAX_ELEMENTS).map(compactElement),
    ...(elements.length > MAX_ELEMENTS && { omittedElements: elements.length - MAX_ELEMENTS }),
  };
}

/** Textul rezultatului, așa cum îl vede modelul în mesajul `tool`. */
export function compactResult(name: ToolName, result: ToolResult): string {
  if (result.ok && name === "get_ui_snapshot" && result.data && typeof result.data === "object") {
    return JSON.stringify({ ok: true, data: compactSnapshot(result.data as UISnapshot) });
  }
  return JSON.stringify(result);
}
