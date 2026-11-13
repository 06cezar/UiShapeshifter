// Configurația interfeței: tot ce se vede pe ecran e randat din acest obiect.
// Agentul o schimbă DOAR prin uneltele patch_config / apply_template / generate_component,
// iar store-ul din frontend refuză orice schimbare care încalcă HARD_LIMITS (vezi specs/07-accesibilitate.md).

import type { ComponentSpec } from "./components";

export const CONTRACT_VERSION = "1.0.0";

/** Șabloane de STRUCTURĂ. Culorile rămân mereu cele din theme, nu ale aplicației care a inspirat structura. */
export type LayoutTemplate =
  | "sidebar-feed"        // meniu lateral + conținut central (familiar celor obișnuiți cu un feed pe desktop)
  | "bottom-nav-stories"  // meniu jos + bandă de „povești” sus (familiar celor obișnuiți cu aplicații de poze pe telefon)
  | "simple-tiles";       // plăci mari, puține, fără meniu ascuns (implicit pentru nevoi mari de accesibilitate)

export type NavPosition = "left" | "top" | "bottom";

export type ModuleType =
  | "messages"
  | "photos"
  | "contacts"
  | "calls"
  | "stories"
  | "feed"
  | "settings"
  | "generated"; // un modul întreg construit la cerere din ComponentSpec

export interface Palette {
  background: string; // hex, ex. "#FFFFFF"
  surface: string;
  text: string;
  textMuted: string;
  primary: string;
  onPrimary: string;
  danger: string;
  focus: string;
}

export interface Theme {
  palette: Palette;
  baseFontPx: number;   // >= limita minimă (HARD_LIMITS.minFontPx și profile.needs.minFontPx)
  scale: number;        // raportul dintre trepte (titluri = baseFontPx * scale^n), 1.125–1.5
  lineHeight: number;   // >= HARD_LIMITS.minLineHeight
  fontFamily: string;
  radiusPx: number;
  spacingPx: number;    // unitatea de spațiere
  highContrast: boolean;
  reducedMotion: boolean;
}

export interface NavConfig {
  position: NavPosition;
  showLabels: boolean;  // text sub iconițe; true pentru utilizatori începători
  iconSizePx: number;
  items: string[];      // id-uri de module, în ordine
}

export interface ModuleConfig {
  id: string;           // unic, ex. "messages", "gen-call-ana"
  type: ModuleType;
  title: string;
  visible: boolean;
  order: number;        // ordinea în conținut
  size: "s" | "m" | "l";
  pinned?: boolean;     // apare primul, nu poate fi ascuns automat
  componentId?: string; // pentru type "generated": cheia din UIConfig.components
}

export interface UIConfig {
  version: string;      // CONTRACT_VERSION
  revision: number;     // crește la fiecare schimbare aplicată; folosit la undo și în jurnal
  template: LayoutTemplate;
  nav: NavConfig;
  theme: Theme;
  modules: ModuleConfig[];
  /** Componente generate la cerere, indexate după id. Plasarea lor e în placements. */
  components: Record<string, ComponentSpec>;
  placements: ComponentPlacement[];
  minTargetPx: number;  // mărimea minimă a oricărei ținte de click
}

export interface ComponentPlacement {
  componentId: string;
  moduleId: string;     // în ce modul apare ("home" = ecranul principal)
  position: "top" | "bottom";
}

/** Subset RFC 6902. Căile sunt JSON Pointer în UIConfig, ex. "/theme/baseFontPx", "/nav/position". */
export interface JsonPatchOp {
  op: "replace" | "add" | "remove";
  path: string;
  value?: unknown;
}

/** Limite pe care NIMENI (nici agentul, nici utilizatorul) nu le poate coborî. */
export const HARD_LIMITS = {
  minFontPx: 16,
  maxFontPx: 40,
  minLineHeight: 1.5,
  minTargetPx: 44,
  minContrastText: 4.5,
  minContrastLargeText: 3,
  minContrastUi: 3,
  largeTextPx: 24, // text >= 24px (sau >= 18.66px bold) e „text mare” la contrast
} as const;

export const DEFAULT_CONFIG: UIConfig = {
  version: CONTRACT_VERSION,
  revision: 0,
  template: "bottom-nav-stories",
  nav: {
    position: "bottom",
    showLabels: true,
    iconSizePx: 28,
    items: ["messages", "photos", "contacts", "calls", "settings"],
  },
  theme: {
    palette: {
      background: "#FFFFFF",
      surface: "#F3F4F6",
      text: "#111827",
      textMuted: "#4B5563",
      primary: "#C2410C",
      onPrimary: "#FFFFFF",
      danger: "#B91C1C",
      focus: "#1D4ED8",
    },
    baseFontPx: 16,
    scale: 1.25,
    lineHeight: 1.5,
    fontFamily: "system-ui, 'Segoe UI', Roboto, Arial, sans-serif",
    radiusPx: 12,
    spacingPx: 8,
    highContrast: false,
    reducedMotion: false,
  },
  modules: [
    { id: "stories", type: "stories", title: "Noutăți", visible: true, order: 0, size: "s" },
    { id: "messages", type: "messages", title: "Mesaje", visible: true, order: 1, size: "l" },
    { id: "photos", type: "photos", title: "Poze", visible: true, order: 2, size: "m" },
    { id: "contacts", type: "contacts", title: "Contacte", visible: true, order: 3, size: "m" },
    { id: "calls", type: "calls", title: "Apeluri", visible: true, order: 4, size: "m" },
    { id: "feed", type: "feed", title: "Ce mai fac ceilalți", visible: true, order: 5, size: "m" },
    { id: "settings", type: "settings", title: "Setări", visible: true, order: 6, size: "s" },
  ],
  components: {},
  placements: [],
  minTargetPx: 44,
};
