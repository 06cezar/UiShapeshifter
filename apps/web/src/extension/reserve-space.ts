// Interfața noastră nu acoperă textul paginii: cât timp panoul, chatul sau mascota stau peste site, pagina primește
// margine (padding pe <html>) cât ocupă ele, iar site-ul se reașază în spațiul rămas în loc să stea sub noi.
// Panoul ia o coloană în dreapta, chatul deschis una în stânga; butonul chatului și mascota iau loc jos.

export interface Edges {
  left: number;
  right: number;
  bottom: number;
}

export interface Box {
  left: number;
  right: number;
  top: number;
  bottom: number;
}

/** Ce parte a ecranului ia un element al nostru: o coloană pe o latură sau o bandă jos. */
export interface Placed {
  box: Box;
  side: "left" | "right" | "bottom";
}
/** Cât spațiu lăsăm între site și interfața noastră. */
export const RESERVE_GAP_PX = 12;

/** Marginile de rezervat, din dreptunghiurile elementelor noastre vizibile. */
export function edgesFor(placed: Placed[], viewport: { width: number; height: number }, gap = RESERVE_GAP_PX): Edges {
  const edges: Edges = { left: 0, right: 0, bottom: 0 };
  for (const { box, side } of placed) {
    if (box.right - box.left <= 0 || box.bottom - box.top <= 0) continue;
    if (side === "right") edges.right = Math.max(edges.right, viewport.width - box.left + gap);
    else if (side === "left") edges.left = Math.max(edges.left, box.right + gap);
    else edges.bottom = Math.max(edges.bottom, viewport.height - box.top + gap);
  }
  return {
    left: Math.round(edges.left),
    right: Math.round(edges.right),
    bottom: Math.round(edges.bottom),
  };
}

const PROPERTIES = { left: "padding-left", right: "padding-right", bottom: "padding-bottom" } as const;

/**
 * Ține marginile la zi cât se schimbă interfața noastră (panoul apare, chatul se deschide). `boxes` întoarce
 * dreptunghiurile de acum; valorile vechi ale site-ului se pun la loc la oprire.
 */
export function startReservingSpace(boxes: () => Placed[], root: Node, doc: Document = document): () => void {
  const html = doc.documentElement;
  const view = doc.defaultView ?? window;
  const original = Object.fromEntries(
    Object.values(PROPERTIES).map((p) => [p, [html.style.getPropertyValue(p), html.style.getPropertyPriority(p)]]),
  ) as Record<string, [string, string]>;
  let last = "";
  let frame = 0;

  function update() {
    frame = 0;
    const edges = edgesFor(boxes(), { width: view.innerWidth, height: view.innerHeight });
    const key = `${edges.left}|${edges.right}|${edges.bottom}`;
    if (key === last) return;
    last = key;
    for (const side of ["left", "right", "bottom"] as const) {
      const property = PROPERTIES[side];
      if (edges[side] > 0) html.style.setProperty(property, `${edges[side]}px`, "important");
      else restore(property);
    }
  }
  function restore(property: string) {
    const [value, priority] = original[property] ?? ["", ""];
    if (value) html.style.setProperty(property, value, priority);
    else html.style.removeProperty(property);
  }
  const schedule = () => {
    if (!frame) frame = view.requestAnimationFrame(update);
  };

  const observer = new MutationObserver(schedule);
  observer.observe(root, { subtree: true, childList: true, attributes: true });
  view.addEventListener("resize", schedule);
  schedule();
  return () => {
    observer.disconnect();
    view.removeEventListener("resize", schedule);
    if (frame) view.cancelAnimationFrame(frame);
    Object.values(PROPERTIES).forEach(restore);
  };
}
