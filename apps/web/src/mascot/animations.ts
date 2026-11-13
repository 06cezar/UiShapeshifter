// Ce cadre ale vulpii (Sunny Land, pixel art) joacă mascota în fiecare stare din specs/11.

import type { MascotState } from "@uishapeshifter/contracts";
import type { FoxSheet } from "./fox-sprites";

/** Stările mascotei, plus mersul (nu e o stare a agentului, ci felul în care ajunge la un element). */
export type MascotPose = MascotState | "walking";

export interface SpriteAnimation {
  sheet: FoxSheet;
  /** Cadre pe secundă. */
  fps: number;
  /** false = se joacă o dată, apoi mascota revine la `IDLE_ANIMATION`. */
  loop: boolean;
}

export const POSE_ANIMATIONS: Record<MascotPose, SpriteAnimation> = {
  idle: { sheet: "idle", fps: 6, loop: true },
  listening: { sheet: "idle", fps: 10, loop: true }, // atentă: respiră mai repede
  thinking: { sheet: "crouch", fps: 3, loop: true }, // ghemuită, cu nasul în jos: „caută” prin pagină
  speaking: { sheet: "idle", fps: 10, loop: true },
  pointing: { sheet: "idle", fps: 6, loop: true }, // stă cu botul spre element
  happy: { sheet: "jump", fps: 4, loop: false },
  confused: { sheet: "hurt", fps: 4, loop: false }, // steluțe în jurul capului
  walking: { sheet: "run", fps: 12, loop: true },
};

/** După o animație care se joacă o dată (happy, confused). */
export const IDLE_ANIMATION: SpriteAnimation = POSE_ANIMATIONS.idle;
