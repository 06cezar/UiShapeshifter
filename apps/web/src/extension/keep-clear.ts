// Butoanele lipite de ecran ale site-ului (ex. „Ai nevoie de ajutor?” jos în stânga) nu se mută când derulezi. Dacă
// butonul nostru de chat ar sta peste unul, îl ridicăm deasupra lui, ca omul să le poată apăsa pe amândouă.
// Doar butoane mici de jos: aplicațiile întregi lipite de ecran (Teams) nu contează, altfel chatul urcă până sus.

/** Cât spațiu lăsăm între butonul site-ului și al nostru. */
export const CLEAR_GAP_PX = 12;
/** Cât de des ne uităm dacă site-ul a pus un buton fix sub chatul nostru (apar și după încărcare, ex. „Ajutor”). */
export const FIXED_CHECK_MS = 1000;
/** Un „buton fix” e mic: cel mult atât din înălțimea și lățimea ecranului; altfel e o bară sau o aplicație întreagă. */
const MAX_FIXED_HEIGHT_RATIO = 0.2;
const MAX_FIXED_WIDTH_RATIO = 0.5;
/** Butonul nostru urcă cel mult atât din înălțimea ecranului și nu iese niciodată din ecran. */
const MAX_LIFT_RATIO = 0.3;
/** Cât din colțul de jos al elementului nostru verificăm (cât butonul închis al chatului). */
const PROBE_STRIP_PX = 40;

export interface Rect {
  left: number;
  right: number;
  top: number;
  bottom: number;
}

/** Cel mai apropiat strămoș lipit de ecran (fixed / sticky), fără să trecem de gazda noastră. */
function fixedAncestor(element: Element | null, ourHost: Element): Element | null {
  for (let node = element; node && node !== ourHost; node = node.parentElement) {
    const position = getComputedStyle(node).position;
    if (position === "fixed" || position === "sticky") return node;
  }
  return null;
}

/** E un buton mic de jos, nu o bară sau toată aplicația? */
export function isSmallBottomFixed(box: Rect, viewport: { width: number; height: number }): boolean {
  const height = box.bottom - box.top;
  const width = box.right - box.left;
  return (
    height > 0 &&
    height <= viewport.height * MAX_FIXED_HEIGHT_RATIO &&
    width <= viewport.width * MAX_FIXED_WIDTH_RATIO &&
    box.bottom >= viewport.height * (1 - MAX_LIFT_RATIO)
  );
}

/** Cât de sus urcă elementul nostru (valoarea lui `bottom`), ca să nu stea peste butonul fix și să rămână în ecran. */
export function liftedBottom(
  base: number,
  fixedTop: number,
  ourHeight: number,
  viewport: { height: number },
  gap = CLEAR_GAP_PX,
): number {
  const wanted = viewport.height - fixedTop + gap;
  const highest = Math.min(viewport.height * MAX_LIFT_RATIO, viewport.height - ourHeight - gap);
  return Math.round(Math.max(base, Math.min(wanted, highest)));
}

/** Ridică elementul nostru (butonul chatului) deasupra unui buton fix mic al site-ului pe care l-ar acoperi. */
export function keepClearOfSiteFixed(ours: HTMLElement, ourHost: Element, doc: Document = document): () => void {
  const view = doc.defaultView ?? window;
  const baseBottom = parseFloat(getComputedStyle(ours).bottom) || 0;
  function check() {
    const viewport = { width: view.innerWidth, height: view.innerHeight };
    // Unde ar sta butonul nostru fără ridicare: banda de jos, la baseBottom.
    const rect = ours.getBoundingClientRect();
    if (rect.width === 0) return;
    const bottom = viewport.height - baseBottom;
    const ys = [bottom - 4, bottom - PROBE_STRIP_PX / 2, bottom - PROBE_STRIP_PX];
    const xs = [rect.left + 4, rect.left + Math.min(rect.width, 200) / 2, rect.left + Math.min(rect.width, 200) - 4];
    let top = Infinity;
    for (const y of ys) {
      for (const x of xs) {
        const element = doc.elementsFromPoint(x, y).find((e) => e !== ourHost && !ourHost.contains(e)) ?? null;
        const fixed = fixedAncestor(element, ourHost);
        if (!fixed) continue;
        const box = fixed.getBoundingClientRect();
        if (isSmallBottomFixed(box, viewport)) top = Math.min(top, box.top);
      }
    }
    const next = top === Infinity ? baseBottom : liftedBottom(baseBottom, top, rect.height, viewport);
    ours.style.bottom = `${next}px`;
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
