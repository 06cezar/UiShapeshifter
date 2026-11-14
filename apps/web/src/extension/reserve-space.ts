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

/** Cât de des ne uităm dacă site-ul a pus un buton fix sub chatul nostru (apar și după încărcare, ex. „Ajutor”). */
export const FIXED_CHECK_MS = 1000;

function isFixed(element: Element | null, ourHost: Element): boolean {
  for (let node = element; node && node !== ourHost; node = node.parentElement) {
    const position = getComputedStyle(node).position;
    if (position === "fixed" || position === "sticky") return true;
  }
  return false;
}

/**
 * Butoanele lipite de ecran ale site-ului (ex. „Ai nevoie de ajutor?” jos în stânga) nu se mută cu marginea paginii.
 * Dacă un element al nostru (butonul chatului) ar sta peste unul, îl ridicăm deasupra lui.
 */
export function keepClearOfSiteFixed(ours: HTMLElement, ourHost: Element, doc: Document = document): () => void {
  const view = doc.defaultView ?? window;
  const baseBottom = parseFloat(getComputedStyle(ours).bottom) || 0;
  function check() {
    ours.style.bottom = `${baseBottom}px`;
    const rect = ours.getBoundingClientRect();
    if (rect.width === 0) return;
    const points: [number, number][] = [
      [rect.left + 4, rect.bottom - 4],
      [rect.right - 4, rect.bottom - 4],
      [(rect.left + rect.right) / 2, (rect.top + rect.bottom) / 2],
      [rect.left + 4, rect.top + 4],
      [rect.right - 4, rect.top + 4],
    ];
    let top = Infinity;
    for (const [x, y] of points) {
      for (const element of doc.elementsFromPoint(x, y)) {
        if (element === ourHost || ourHost.contains(element)) continue;
        if (isFixed(element, ourHost)) top = Math.min(top, element.getBoundingClientRect().top);
        break; // doar elementul de deasupra din pagină
      }
    }
    if (top !== Infinity) ours.style.bottom = `${Math.round(view.innerHeight - top + RESERVE_GAP_PX)}px`;
  }
  check();
  const timer = view.setInterval(check, FIXED_CHECK_MS);
  view.addEventListener("resize", check);
  return () => {
    view.clearInterval(timer);
    view.removeEventListener("resize", check);
    ours.style.bottom = `${baseBottom}px`;
  };
}
