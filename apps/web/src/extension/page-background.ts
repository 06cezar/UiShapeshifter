// „Fundal roz pe toate site-urile”: CSS-ul preferinței colorează `html, body`, dar multe site-uri își pun propriile
// cutii albe peste (antet, conținut, coloane), iar fundalul nostru nu se vede (proba Iuliei pe Bilibili). Aici colorăm
// și cutiile mari și deschise la culoare care acoperă pagina, fără AI. Butoanele, pozele, bannerele colorate și
// elementele mici rămân cum sunt. Pe site-urile întunecate nu schimbăm nimic (cutiile lor nu sunt deschise).

/** O cutie „acoperă pagina” dacă e cel puțin atât de lată (din ecran) și atât de înaltă. */
const MIN_WIDTH_RATIO = 0.5;
const MIN_HEIGHT_PX = 80;
/** Doar fundalurile deschise (alb, gri deschis): pe cele colorate sau întunecate le lasă site-ului. */
const LIGHT_LUMINANCE = 0.8;
/** Fundal opac: unul transparent lasă oricum să se vadă culoarea de dedesubt. */
const OPAQUE_ALPHA = 0.95;
/** Site-urile își încarcă bucăți după încărcare (SPA): recolorăm după o scurtă pauză. */
const REPAINT_DEBOUNCE_MS = 700;
/** Elemente care nu sunt „fundal de pagină”, oricât de mari. */
const NOT_BACKGROUND = new Set([
  "IMG",
  "VIDEO",
  "CANVAS",
  "SVG",
  "IFRAME",
  "BUTTON",
  "INPUT",
  "SELECT",
  "TEXTAREA",
  "A",
]);
/** O culoare simplă: fără url() sau alte valori care n-au ce căuta într-un fundal pus de noi. */
const SIMPLE_COLOR = /^(#[0-9a-f]{3,8}|(rgb|hsl)a?\([\d\s.,%/]+\)|[a-z]+)$/i;

/** Culoarea de fundal cerută pentru `html` sau `body` în CSS-ul preferinței, dacă există. */
export function pageBackgroundFrom(css: string): string | null {
  for (const rule of css.match(/[^{}]+\{[^{}]*\}/g) ?? []) {
    const open = rule.indexOf("{");
    const selectors = rule
      .slice(0, open)
      .split(",")
      .map((s) => s.trim().toLowerCase());
    if (!selectors.includes("html") && !selectors.includes("body")) continue;
    const match = /background(?:-color)?\s*:\s*([^;}]+)/i.exec(rule.slice(open));
    const value = match?.[1]?.replace(/!important/i, "").trim();
    if (value && SIMPLE_COLOR.test(value)) return value;
  }
  return null;
}

/** [r, g, b, a] din „rgb(…)” / „rgba(…)”, cum îl dă getComputedStyle. */
function rgba(value: string): [number, number, number, number] | null {
  const parts = /rgba?\(([^)]+)\)/
    .exec(value)?.[1]
    ?.split(/[,\s/]+/)
    .filter(Boolean)
    .map(Number);
  if (!parts || parts.length < 3 || parts.some(Number.isNaN)) return null;
  return [parts[0]!, parts[1]!, parts[2]!, parts[3] ?? 1];
}

/** Fundal opac și deschis la culoare (luminanța relativă, WCAG). */
export function isLightOpaque(color: string): boolean {
  const c = rgba(color);
  if (!c || c[3] < OPAQUE_ALPHA) return false;
  const [r, g, b] = c.slice(0, 3).map((v) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  }) as [number, number, number];
  return 0.2126 * r + 0.7152 * g + 0.0722 * b >= LIGHT_LUMINANCE;
}

export interface PageBackgroundOptions {
  ourHostId: string;
  doc?: Document;
  /** În teste: dreptunghiul unui element (happy-dom nu face layout). */
  rectOf?(element: Element): { width: number; height: number };
}

/**
 * Colorează cu `color` cutiile mari și deschise ale paginii și le ține colorate cât site-ul adaugă conținut.
 * Întoarce funcția care pune totul la loc (preferința scoasă, altă culoare).
 */
export function startPageBackground(color: string, options: PageBackgroundOptions): () => void {
  const doc = options.doc ?? document;
  const view = doc.defaultView ?? window;
  const rectOf = options.rectOf ?? ((element: Element) => element.getBoundingClientRect());
  const painted = new Map<HTMLElement, [string, string]>();
  let timer: ReturnType<typeof setTimeout> | undefined;

  function paint() {
    const ourHost = doc.getElementById(options.ourHostId);
    const minWidth = view.innerWidth * MIN_WIDTH_RATIO;
    for (const element of doc.body?.querySelectorAll<HTMLElement>("*") ?? []) {
      if (painted.has(element) || NOT_BACKGROUND.has(element.tagName.toUpperCase())) continue;
      if (ourHost && (element === ourHost || ourHost.contains(element))) continue;
      const rect = rectOf(element);
      if (rect.width < minWidth || rect.height < MIN_HEIGHT_PX) continue;
      const style = getComputedStyle(element);
      const image = style.backgroundImage;
      if ((image && image !== "none") || !isLightOpaque(style.backgroundColor)) continue;
      painted.set(element, [
        element.style.getPropertyValue("background-color"),
        element.style.getPropertyPriority("background-color"),
      ]);
      element.style.setProperty("background-color", color, "important");
    }
  }
  const schedule = () => {
    clearTimeout(timer);
    timer = setTimeout(paint, REPAINT_DEBOUNCE_MS);
  };

  const observer = new MutationObserver(schedule);
  if (doc.body) observer.observe(doc.body, { childList: true, subtree: true });
  paint();
  return () => {
    observer.disconnect();
    clearTimeout(timer);
    for (const [element, [value, priority]] of painted) {
      if (value) element.style.setProperty("background-color", value, priority);
      else element.style.removeProperty("background-color");
    }
    painted.clear();
  };
}
