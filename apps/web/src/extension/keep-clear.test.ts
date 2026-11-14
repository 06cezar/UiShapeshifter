// Butonul chatului urcă doar peste butoane fixe mici de jos, nu peste aplicații întregi (Teams), și nu iese din ecran.

import { describe, expect, test } from "vitest";
import { isSmallBottomFixed, liftedBottom } from "./keep-clear";

const SCREEN = { width: 1600, height: 900 };

describe("butonul chatului lângă butoanele fixe ale site-ului", () => {
  test("„Ai nevoie de ajutor?” (mic, jos) contează; toată aplicația sau o bară de sus nu", () => {
    expect(isSmallBottomFixed({ left: 16, right: 211, top: 840, bottom: 884 }, SCREEN)).toBe(true);
    expect(isSmallBottomFixed({ left: 0, right: 1600, top: 130, bottom: 900 }, SCREEN)).toBe(false);
    expect(isSmallBottomFixed({ left: 0, right: 600, top: 0, bottom: 60 }, SCREEN)).toBe(false);
  });

  test("urcă deasupra butonului, dar cel mult o treime de ecran și niciodată afară din ecran", () => {
    expect(liftedBottom(16, 840, 44, SCREEN, 12)).toBe(72);
    expect(liftedBottom(16, 100, 44, SCREEN, 12)).toBe(270);
    expect(liftedBottom(16, 400, 850, SCREEN, 12)).toBe(38);
  });
});
