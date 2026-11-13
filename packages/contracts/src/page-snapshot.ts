// Ce „vede” agentul dintr-o pagină reală: un rezumat, nu tot DOM-ul. Îl produce registrul paginii (B) pentru
// get_page_snapshot. Regulile id-urilor și ale rezumatului: specs/04-registru-si-snapshot.md.
//
// Înlocuiește `UISnapshot` din snapshot.ts pentru site-uri reale; `UISnapshot` rămâne cât mai există aplicația veche.

import type { Rect } from "./snapshot";

export const SNAPSHOT_LIMITS = {
  /** Cel mult atâtea elemente în rezumat; restul se cer pe zone (`regionId`). */
  maxElements: 80,
  labelMaxChars: 80,
  /** Din foaia de stil curentă trimisă modelului; peste, se taie cu „…”. */
  maxRecipeCssChars: 4000,
} as const;

/** O zonă mare a paginii (antet, meniu, conținut, rafturi…), găsită după rol ARIA sau structură. */
export interface PageRegion {
  /** Id stabil din registru, ex. „r.nav”, „r.main”, „r.aside-2”. */
  id: string;
  role: string;            // „banner”, „navigation”, „main”, „complementary”, „contentinfo”, „region”
  /** Selectorul zonei, cu aceleași reguli ca `PageElement.selector`: agentul îl pune în `apply_css` („fă bara de sus albastră”). */
  selector: string;
  label: string;           // titlul zonei sau primul titlu din ea, tăiat la labelMaxChars
  rect: Rect;
  visible: boolean;
  /** Câte elemente sunt în zonă, inclusiv cele care n-au încăput în `elements`. */
  elementCount: number;
}

/** Un element din pagina site-ului, cu un id pe care registrul îl ține stabil cât timp elementul e același. */
export interface PageElement {
  /** Id din registru, ex. „e.17”. Se folosește la `point_at` și la rețeta salvată; nu e un atribut al site-ului. */
  id: string;
  /** Selectorul CSS pe care îl poate folosi agentul în `apply_css` (rol, text, structură; nu clase generate). */
  selector: string;
  tag: string;             // „a”, „button”, „div”…
  role: string;            // rolul ARIA sau cel implicit al etichetei
  label: string;           // textul accesibil sau textul vizibil, tăiat
  regionId?: string;
  rect: Rect;              // în px CSS, față de viewport
  visible: boolean;        // are mărime și nu e ascuns (display, visibility, opacity 0)
  inViewport: boolean;
  interactive: boolean;
  fontPx?: number;         // pentru elementele cu text
  /** Doar când `visible` e false: „recipe” = l-a ascuns rețeta noastră (așa verifică agentul după apply_css). */
  hiddenBy?: "recipe" | "site";
}

export interface PageSnapshot {
  url: string;
  host: string;
  title: string;
  viewport: { width: number; height: number };
  regions: PageRegion[];
  elements: PageElement[];
  /** true dacă pagina avea mai multe elemente decât `maxElements`; agentul cere o zonă anume. */
  truncated: boolean;
  /** Rețeta aplicată acum, ca agentul să știe ce a schimbat deja (css tăiat la `maxRecipeCssChars`). */
  recipe: { revision: number; css: string };
  takenAt: string;         // ISO
}
