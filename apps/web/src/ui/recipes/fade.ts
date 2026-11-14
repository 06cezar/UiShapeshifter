// Urma vizuală a ce ascunde agentul („Cât mai seamless”, specs/00): elementul dispare din pagină în aceeași clipă
// (snapshot-ul și auditul îl văd ascuns, `hiddenBy: "recipe"`), iar o copie fără viață, pusă exact peste locul lui,
// se stinge în FADE_MS. Copia nu e a site-ului: are un id „uishapeshifter-…” (motorul de rețete n-o prinde cu
// selectorii agentului) și `data-agent-id` (registrul și auditul o sar). Fără animație la mișcare redusă.

/** Cât durează stingerea. Scurt: e doar o urmă, nu o pauză în rularea agentului. */
export const FADE_MS = 200;
/** Cât mai stă copia după stingere, ca tranziția să se termine sigur înainte s-o scoatem. */
const FADE_CLEANUP_MS = 50;
/** Copiile mai mari de atât (aproape toată pagina) nu se animă: o copie uriașă ar costa mai mult decât arată. */
const MAX_FADE_AREA_SHARE = 0.6;
/** Id-ul copiilor conține „uishapeshifter”, ca motorul de rețete să nu le prindă cu selectorii agentului. */
const FADE_ID_PREFIX = "uishapeshifter-fade-";
/** Foaia preferințelor de bază pentru mișcare redusă (a11y/base-preferences.ts, BASE_STYLE_ID). */
const REDUCED_MOTION_STYLE_ID = "uishapeshifter-base";

/** Un element pe care agentul îl ascunde acum, cu locul lui de dinainte. */
export interface Leaving {
  element: Element;
  rect: DOMRect;
  /** `display` de dinainte: după ascundere elementul are `none`, iar copia trebuie să arate ca el. */
  display: string;
}

let fadeCount = 0;

/** Omul a cerut mișcare redusă: din sistem sau din profil (foaia preferințelor de bază e pusă). */
export function prefersReducedMotion(doc: Document): boolean {
  if (doc.getElementById(REDUCED_MOTION_STYLE_ID)) return true;
  return doc.defaultView?.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
}

/** Elementele vizibile acum dintr-o listă, cu locul lor: măsurat ÎNAINTE de ascundere. */
export function measureLeaving(elements: Iterable<Element>): Leaving[] {
  const leaving: Leaving[] = [];
  for (const element of elements) {
    const rect = element.getBoundingClientRect();
    if (rect.width > 0 && rect.height > 0) leaving.push({ element, rect, display: getComputedStyle(element).display });
  }
  return leaving;
}

/**
 * Pune peste locul fiecărui element ascuns o copie care se stinge. Elementul însuși e deja ascuns: copia e doar
 * imagine, fără id-uri ale site-ului (n-ar mai fi unice) și fără să primească click-uri.
 */
export function fadeOut(leaving: readonly Leaving[], doc: Document): void {
  if (leaving.length === 0 || prefersReducedMotion(doc)) return;
  const view = doc.defaultView;
  const viewportArea = (view?.innerWidth ?? 0) * (view?.innerHeight ?? 0);
  for (const { element, rect, display } of leaving) {
    const parent = element.parentElement;
    if (!parent || !(element instanceof HTMLElement)) continue;
    if (viewportArea > 0 && (rect.width * rect.height) / viewportArea > MAX_FADE_AREA_SHARE) continue;
    const ghost = element.cloneNode(true) as HTMLElement;
    ghost.removeAttribute("data-uishapeshifter-hidden");
    for (const node of [ghost, ...ghost.querySelectorAll("[id]")]) node.removeAttribute("id");
    ghost.id = `${FADE_ID_PREFIX}${++fadeCount}`;
    ghost.setAttribute("data-agent-id", "fade");
    ghost.setAttribute("aria-hidden", "true");
    const style = ghost.style;
    style.setProperty("position", "fixed", "important");
    style.setProperty("left", `${rect.left}px`, "important");
    style.setProperty("top", `${rect.top}px`, "important");
    style.setProperty("width", `${rect.width}px`, "important");
    style.setProperty("height", `${rect.height}px`, "important");
    style.setProperty("margin", "0", "important");
    style.setProperty("box-sizing", "border-box", "important");
    style.setProperty("pointer-events", "none", "important");
    // `inline` n-ar lua lățimea și înălțimea date; restul își păstrează felul (flex, grid, block)
    style.setProperty("display", display === "inline" ? "inline-block" : display, "important");
    style.setProperty("opacity", "1", "important");
    style.setProperty("transition", `opacity ${FADE_MS}ms ease-out`, "important");
    parent.insertBefore(ghost, element);
    // un cadru întâi, ca browserul să deseneze opacitatea 1 înainte s-o coboare
    const start = () => ghost.style.setProperty("opacity", "0", "important");
    if (view?.requestAnimationFrame) view.requestAnimationFrame(start);
    else start();
    setTimeout(() => ghost.remove(), FADE_MS + FADE_CLEANUP_MS);
  }
}
