// Elemente DOM generate la cerere (div-uri, plăci, scurtături, mini-funcții).
// Agentul NU scrie HTML sau cod: compune un arbore din catalogul de mai jos, iar frontend-ul îl randează
// cu componentele lui. Așa orice element generat respectă tema, limitele de accesibilitate și registrul.

export type ComponentType =
  | "stack"       // coloană
  | "row"         // rând
  | "grid"        // grilă, props.columns
  | "card"        // suprafață cu titlu opțional
  | "heading"
  | "text"
  | "button"
  | "image"
  | "contactTile" // placă mare cu poza și numele unui contact
  | "shortcut"    // buton mare care declanșează o acțiune a aplicației
  | "list"        // listă legată la o sursă de date (props.source)
  | "badge"
  | "divider";

export type IconName =
  | "message" | "photo" | "phone" | "video" | "contacts" | "settings" | "home"
  | "heart" | "star" | "camera" | "send" | "help" | "back" | "plus";

/** Acțiunile pe care le poate declanșa un element generat. Doar acestea, nimic arbitrar. */
export type AppAction =
  | { kind: "navigate"; moduleId: string }
  | { kind: "openChat"; contactId: string }
  | { kind: "call"; contactId: string; video?: boolean }
  | { kind: "sendPhoto"; contactId?: string }
  | { kind: "openSettings" }
  | { kind: "askAgent"; goal: string }; // pornește agentul cu un scop (ex. „ajută-mă cu poza”)

/** Surse de date la care se poate lega o listă. */
export type DataSource =
  | "contacts.favorites"
  | "contacts.all"
  | "messages.unread"
  | "messages.recent"
  | "photos.recent"
  | "calls.missed";

export interface ComponentProps {
  text?: string;
  label?: string;       // obligatoriu pentru button/shortcut: devine și aria-label
  icon?: IconName;
  src?: string;         // image: doar URL-uri din /assets sau din datele de test
  alt?: string;         // image: obligatoriu
  contactId?: string;
  source?: DataSource;  // list
  limit?: number;       // list
  columns?: number;     // grid, 1–4
  tone?: "primary" | "neutral" | "danger";
  size?: "m" | "l" | "xl";
}

export interface ComponentSpec {
  id: string;           // unic în UIConfig.components; elementul randat primește data-agent-id="gen.<id>"
  type: ComponentType;
  props?: ComponentProps;
  action?: AppAction;   // doar pentru button / shortcut / contactTile
  children?: ComponentSpec[];
}

/** Limite de validare pentru arborii generați (verificate în frontend înainte de randare). */
export const COMPONENT_LIMITS = {
  maxDepth: 4,
  maxNodes: 30,
  maxTextChars: 120,
} as const;
