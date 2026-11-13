import { describe, expect, test } from "vitest";
import { POSE_ANIMATIONS } from "./animations";
import { FOX_SPRITES } from "./fox-sprites";

/** Primii 8 octeți ai oricărui PNG. */
const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

describe("animațiile mascotei", () => {
  test("fiecare stare are o foaie de cadre care chiar există, cu cel puțin un cadru", () => {
    for (const [pose, animation] of Object.entries(POSE_ANIMATIONS)) {
      expect(FOX_SPRITES[animation.sheet], pose).toBeDefined();
      expect(FOX_SPRITES[animation.sheet].length, pose).toBeGreaterThan(0);
      expect(animation.fps, pose).toBeGreaterThan(0);
    }
  });

  test("cadrele sunt PNG-uri întregi", () => {
    for (const frames of Object.values(FOX_SPRITES))
      for (const base64 of frames) {
        const bytes = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
        expect([...bytes.subarray(0, 8)]).toEqual(PNG_SIGNATURE);
      }
  });
});
