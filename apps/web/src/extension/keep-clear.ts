// Butoanele lipite de ecran ale site-ului (ex. „Ai nevoie de ajutor?” jos în stânga) nu se mută când derulezi. Dacă
// butonul nostru de chat ar sta peste unul, îl ridicăm deasupra lui, ca omul să le poată apăsa pe amândouă.

/** Cât spațiu lăsăm între butonul site-ului și al nostru. */
export const CLEAR_GAP_PX = 12;

/** Cât de des ne uităm dacă site-ul a pus un buton fix sub chatul nostru (apar și după încărcare, ex. „Ajutor”). */
export const FIXED_CHECK_MS = 1000;

function isFixed(element: Element | null, ourHost: Element): boolean {
  for (let node = element; node && node !== ourHost; node = node.parentElement) {
    const position = getComputedStyle(node).position;
    if (position === "fixed" || position === "sticky") return true;
  }
  return false;
}

/** Ridică elementul nostru (butonul chatului) deasupra unui buton fix al site-ului pe care l-ar acoperi. */
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
    if (top !== Infinity) ours.style.bottom = `${Math.round(view.innerHeight - top + CLEAR_GAP_PX)}px`;
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
