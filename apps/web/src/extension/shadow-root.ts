// Rădăcina interfeței noastre în pagina unui site: un element gazdă cu shadow DOM închis la stilurile site-ului.
// Mascota, chatul și panoul (D) se montează aici, ca site-ul să nu ne strice și noi să nu-l stricăm (specs/01).

/** Id-ul gazdei: conține „uishapeshifter”, ca validarea CSS (C5) să blocheze orice selector spre interfața noastră; registrul îl sare. */
export const HOST_ID = "uishapeshifter-root";

/** Peste orice element al site-ului: cea mai mare valoare z-index posibilă. */
const TOP_Z_INDEX = "2147483647";

/** Stilul gazdei: fixă, peste tot, mereu vizibilă, fără mărime proprie (conținutul din shadow se poziționează singur). */
const HOST_STYLE: Record<string, string> = {
  display: "block",
  visibility: "visible",
  opacity: "1",
  position: "fixed",
  inset: "auto 0 0 auto",
  width: "0",
  height: "0",
  "z-index": TOP_Z_INDEX,
  transform: "none",
  filter: "none",
};

/** Tema interfeței noastre, ca variabile CSS (nicio culoare sau mărime direct în componente). */
const THEME_CSS = `
:host {
  all: initial;
  --uis-font: system-ui, -apple-system, "Segoe UI", sans-serif;
  --uis-font-size: 16px;
  --uis-bg: #1f2430;
  --uis-fg: #ffffff;
  --uis-accent: #ff8a3d;
  --uis-muted: #c8ccd6;
  --uis-ok: #4cc38a;
  --uis-warn: #f2c94c;
  --uis-error: #ff6b6b;
  --uis-radius: 999px;
  --uis-space: 8px;
  --uis-target: 44px;
  --uis-shadow: 0 4px 16px rgba(0, 0, 0, 0.3);
}
`;

export interface OurRoot {
  host: HTMLElement;
  shadow: ShadowRoot;
  /** Adaugă o foaie de stil în shadow DOM (fiecare parte a interfeței o aduce pe a ei). */
  addStyle(css: string): void;
}

/** Creează gazda o singură dată pe pagină; a doua chemare întoarce aceeași rădăcină. */
export function mountOurRoot(doc: Document = document): OurRoot {
  const existing = doc.getElementById(HOST_ID);
  const host = existing ?? doc.createElement("div");
  if (!existing) {
    host.id = HOST_ID;
    // Inline cu !important: bate orice foaie de stil a paginii, deci și o regulă largă a agentului (`* {display:none}`,
    // `html > div {…}`) pe care validarea n-o poate lega de numele nostru. Interfața noastră rămâne vizibilă.
    for (const [property, value] of Object.entries(HOST_STYLE)) host.style.setProperty(property, value, "important");
    doc.documentElement.appendChild(host);
  }
  const shadow = host.shadowRoot ?? host.attachShadow({ mode: "open" });

  function addStyle(css: string) {
    const style = doc.createElement("style");
    style.textContent = css;
    shadow.appendChild(style);
  }
  if (!existing) addStyle(THEME_CSS);

  return { host, shadow, addStyle };
}
