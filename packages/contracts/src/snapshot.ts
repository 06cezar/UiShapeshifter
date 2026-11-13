// Ce „vede” agentul din interfața randată. Îl produce registrul de elemente din frontend
// (get_ui_snapshot) din elementele care au atributul data-agent-id.
//
// Convenția de id-uri: "<modul>.<element>", ex. "nav.messages", "messages.compose", "photos.send",
// "contacts.ana". Elementele generate: "gen.<componentId>" (și "gen.<componentId>.<copil>").

export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface ElementInfo {
  id: string;            // data-agent-id
  role: string;          // rolul ARIA sau tag-ul: "button", "link", "heading", "img", "textbox", "region"…
  label: string;         // textul accesibil (aria-label sau textul vizibil), tăiat la 80 de caractere
  moduleId?: string;
  rect: Rect;            // din getBoundingClientRect, în px CSS
  visible: boolean;      // are mărime, nu e display:none / visibility:hidden / opacity 0
  inViewport: boolean;
  interactive: boolean;
  fontPx?: number;       // pentru elementele cu text
  fontWeight?: number;
  color?: string;        // culoarea textului, hex
  background?: string;   // fundalul efectiv (primul strămoș opac), hex
  contrast?: number;     // raportul WCAG calculat
  clipped?: boolean;     // scrollWidth > clientWidth sau scrollHeight > clientHeight
}

export interface UISnapshot {
  route: string;          // modulul afișat acum, ex. "home", "messages", "chat:ana"
  configRevision: number; // UIConfig.revision
  viewport: { width: number; height: number };
  openOverlays: string[]; // id-uri de meniuri sau dialoguri deschise
  elements: ElementInfo[];
  takenAt: string;        // ISO
}
