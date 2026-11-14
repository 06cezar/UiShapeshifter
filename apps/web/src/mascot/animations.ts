// Ce cadre ale ratonului joacă mascota în fiecare stare din specs/11.

import type { MascotState } from "@uishapeshifter/contracts";
import { MASCOT_SPRITES, type SpriteSheet } from "./mascot-sprites";

/** Stările mascotei, plus mersul (nu e o stare a agentului, ci felul în care ajunge la un element). */
export type MascotPose = MascotState | "walking";

export interface SpriteAnimation {
  sheet: SpriteSheet;
  /** Cadre pe secundă. */
  fps: number;
  /** false = se joacă o dată, apoi mascota revine la `IDLE_ANIMATION`. */
  loop: boolean;
}

/**
 * Dansul (happy) merge pe bătăi, ca un clip pe muzică: cadrele, rotirea și notele din CSS (mascot-styles.ts) și durata
 * dansului (mascot.ts) pleacă toate de la aceleași valori, ca să rămână în ritm între ele.
 */
export const DANCE_BEAT_MS = 400;
export const DANCE_BEATS_PER_BAR = 4;
/** Măsurile în ritm normal (o tură de raton pe măsură), apoi finalul, în care se învârte de două ori mai repede. */
export const DANCE_STEADY_BARS = 2;
export const DANCE_FINALE_BARS = 1;
export const DANCE_FINALE_TURNS_PER_BAR = 2;
export const DANCE_BAR_MS = DANCE_BEAT_MS * DANCE_BEATS_PER_BAR;
/** Cât dansează după o rulare reușită, apoi revine la idle. */
export const DANCE_MS = (DANCE_STEADY_BARS + DANCE_FINALE_BARS) * DANCE_BAR_MS;
/** Pașii de dans desenați (un ciclu de cadre) țin atâtea bătăi. */
const DANCE_BEATS_PER_STEP_CYCLE = 2;
const DANCE_FPS = (MASCOT_SPRITES.dance.length * 1000) / (DANCE_BEATS_PER_STEP_CYCLE * DANCE_BEAT_MS);

export const POSE_ANIMATIONS: Record<MascotPose, SpriteAnimation> = {
  idle: { sheet: "idle", fps: 10, loop: true },
  listening: { sheet: "idle", fps: 14, loop: true }, // atent: respiră mai repede
  thinking: { sheet: "crouch", fps: 10, loop: true }, // ghemuit, cu laba la bot: „se gândește”
  speaking: { sheet: "idle", fps: 14, loop: true },
  pointing: { sheet: "idle", fps: 10, loop: true }, // stă cu botul spre element
  happy: { sheet: "dance", fps: DANCE_FPS, loop: true }, // pașii de dans, pe ritm; rotirea în cerc vine din CSS
  confused: { sheet: "ko", fps: 10, loop: false }, // cade pe spate, apoi se ridică (idle)
  walking: { sheet: "walk", fps: 14, loop: true },
};

/** După o animație care se joacă o dată (confused). */
export const IDLE_ANIMATION: SpriteAnimation = POSE_ANIMATIONS.idle;
