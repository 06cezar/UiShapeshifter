import { describe, expect, test } from "vitest";
import { POSE_ANIMATIONS } from "./animations";
import { MASCOT_SPRITES } from "./mascot-sprites";

/** Un WebP începe cu „RIFF”, lungimea, apoi „WEBP”. */
const RIFF = "RIFF";
const WEBP = "WEBP";

describe("animațiile mascotei", () => {
  test("fiecare stare are o foaie de cadre care chiar există, cu cel puțin un cadru", () => {
    for (const [pose, animation] of Object.entries(POSE_ANIMATIONS)) {
      expect(MASCOT_SPRITES[animation.sheet], pose).toBeDefined();
      expect(MASCOT_SPRITES[animation.sheet].length, pose).toBeGreaterThan(0);
      expect(animation.fps, pose).toBeGreaterThan(0);
    }
  });

  test("cadrele sunt WebP-uri întregi", () => {
    for (const frames of Object.values(MASCOT_SPRITES))
      for (const base64 of frames) {
        const bytes = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
        const text = (from: number, to: number) => String.fromCharCode(...bytes.subarray(from, to));
        expect(text(0, 4)).toBe(RIFF);
        expect(text(8, 12)).toBe(WEBP);
      }
  });
});
