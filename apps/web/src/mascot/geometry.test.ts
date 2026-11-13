import { describe, expect, test } from "vitest";
import { clampToViewport, homePosition, needsScroll, pointPlacement, stepToward } from "./geometry";

const VIEWPORT = { width: 1000, height: 800 };
const SIZE = { width: 150, height: 130 };
const MARGIN = 8;
const GAP = 4;

describe("acasă", () => {
  test("colțul de jos din dreapta, la marginea cerută", () => {
    expect(homePosition(VIEWPORT, SIZE, MARGIN)).toEqual({ x: 842, y: 662 });
  });

  test("rămâne în ecran", () => {
    expect(clampToViewport({ x: -50, y: 2000 }, SIZE, VIEWPORT, MARGIN)).toEqual({ x: 8, y: 662 });
  });
});

describe("lângă element", () => {
  const button = { x: 400, y: 300, width: 100, height: 40 };

  test("venind din dreapta, stă în dreapta elementului și se uită spre stânga", () => {
    const place = pointPlacement(button, SIZE, VIEWPORT, { x: 842, y: 662 }, MARGIN, GAP);
    expect(place).toEqual({ x: 504, y: 255, facing: "left" });
  });

  test("venind din stânga, stă în stânga elementului și se uită spre dreapta", () => {
    const place = pointPlacement(button, SIZE, VIEWPORT, { x: 0, y: 0 }, MARGIN, GAP);
    expect(place).toEqual({ x: 246, y: 255, facing: "right" });
  });

  test("lângă marginea din dreapta, trece în stânga elementului", () => {
    const nearEdge = { x: 900, y: 300, width: 80, height: 40 };
    const place = pointPlacement(nearEdge, SIZE, VIEWPORT, { x: 842, y: 662 }, MARGIN, GAP);
    expect(place.facing).toBe("right");
    expect(place.x + SIZE.width).toBeLessThanOrEqual(nearEdge.x);
  });

  test("un element cât tot ecranul în lățime: stă sub el", () => {
    const banner = { x: 0, y: 100, width: 1000, height: 60 };
    const place = pointPlacement(banner, SIZE, VIEWPORT, { x: 842, y: 662 }, MARGIN, GAP);
    expect(place.y).toBe(164);
  });

  test("un element sus de tot nu împinge mascota afară din ecran", () => {
    const top = { x: 400, y: 0, width: 100, height: 20 };
    const place = pointPlacement(top, SIZE, VIEWPORT, { x: 842, y: 662 }, MARGIN, GAP);
    expect(place.y).toBe(MARGIN);
  });
});

describe("derulare", () => {
  test("în ecran: nu derulează", () => {
    expect(needsScroll({ x: 10, y: 10, width: 100, height: 40 }, VIEWPORT)).toBe(false);
  });

  test("sub ecran sau tăiat jos: derulează", () => {
    expect(needsScroll({ x: 10, y: 900, width: 100, height: 40 }, VIEWPORT)).toBe(true);
    expect(needsScroll({ x: 10, y: 780, width: 100, height: 40 }, VIEWPORT)).toBe(true);
  });

  test("mai înalt decât ecranul, dar vizibil: nu derulează", () => {
    expect(needsScroll({ x: 0, y: -200, width: 800, height: 2000 }, VIEWPORT)).toBe(false);
  });
});

describe("mers", () => {
  test("un pas nu trece de țintă", () => {
    expect(stepToward({ x: 0, y: 0 }, { x: 3, y: 4 }, 10)).toEqual({ point: { x: 3, y: 4 }, arrived: true });
    expect(stepToward({ x: 0, y: 0 }, { x: 30, y: 40 }, 10)).toEqual({ point: { x: 6, y: 8 }, arrived: false });
  });
});
