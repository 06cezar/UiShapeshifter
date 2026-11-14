// Ce cadre ale ratonului joacă mascota în fiecare stare din specs/11.

import type { MascotState } from "@uishapeshifter/contracts";
import type { SpriteSheet } from "./mascot-sprites";

/** Stările mascotei, plus mersul (nu e o stare a agentului, ci felul în care ajunge la un element). */
export type MascotPose = MascotState | "walking";

export interface SpriteAnimation {
  sheet: SpriteSheet;
  /** Cadre pe secundă. */
  fps: number;
  /** false = se joacă o dată, apoi mascota revine la `IDLE_ANIMATION`. */
  loop: boolean;
}

export const POSE_ANIMATIONS: Record<MascotPose, SpriteAnimation> = {
  idle: { sheet: "idle", fps: 10, loop: true },
  listening: { sheet: "idle", fps: 14, loop: true }, // atent: respiră mai repede
  thinking: { sheet: "crouch", fps: 10, loop: true }, // ghemuit, cu laba la bot: „se gândește”
  speaking: { sheet: "idle", fps: 14, loop: true },
  pointing: { sheet: "idle", fps: 10, loop: true }, // stă cu botul spre element
  happy: { sheet: "dance", fps: 14, loop: true }, // dansul victoriei, cât ține DANCE_MS (mascot.ts), plus rotirea din CSS
  confused: { sheet: "ko", fps: 10, loop: false }, // cade pe spate, apoi se ridică (idle)
  walking: { sheet: "walk", fps: 14, loop: true },
};

/** După o animație care se joacă o dată (confused). */
export const IDLE_ANIMATION: SpriteAnimation = POSE_ANIMATIONS.idle;
