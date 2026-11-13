// Unde stă mascota: acasă (colțul de jos) și lângă un element arătat cu point_at (specs/11, „Coordonatele”).
// Funcții pure, pe dreptunghiuri în coordonatele ferestrei, ca să le putem testa fără browser.

export interface Point {
  x: number;
  y: number;
}

export interface Size {
  width: number;
  height: number;
}

export interface Box extends Point, Size {}

export type Facing = "left" | "right";

/** Unde stă mascota (colțul ei din stânga sus) și încotro se uită. */
export interface Placement extends Point {
  facing: Facing;
}

/** Colțul de jos din dreapta: chatul stă în stânga, iar navigația site-ului e de obicei sus. */
export function homePosition(viewport: Size, size: Size, margin: number): Point {
  return { x: viewport.width - size.width - margin, y: viewport.height - size.height - margin };
}

export function clampToViewport(point: Point, size: Size, viewport: Size, margin: number): Point {
  const maxX = Math.max(margin, viewport.width - size.width - margin);
  const maxY = Math.max(margin, viewport.height - size.height - margin);
  return { x: Math.min(Math.max(point.x, margin), maxX), y: Math.min(Math.max(point.y, margin), maxY) };
}

/** Trebuie derulat până la element? Da, dacă e în afara ecranului sau, când încape, dacă iese parțial din el. */
export function needsScroll(rect: Box, viewport: Size): boolean {
  const outside =
    rect.y + rect.height <= 0 || rect.y >= viewport.height || rect.x + rect.width <= 0 || rect.x >= viewport.width;
  const fitsVertically = rect.height <= viewport.height;
  const cutVertically = rect.y < 0 || rect.y + rect.height > viewport.height;
  return outside || (fitsVertically && cutVertically);
}

/**
 * Locul de lângă element: pe latura dinspre mascotă (ca să nu traverseze elementul), la mijlocul lui pe verticală,
 * cu fața spre el. Dacă nu încape nici în stânga, nici în dreapta (element lat), stă sub el sau deasupra.
 */
export function pointPlacement(
  rect: Box,
  size: Size,
  viewport: Size,
  from: Point,
  margin: number,
  gap: number,
): Placement {
  const middleY = rect.y + rect.height / 2 - size.height / 2;
  const left: Placement = { x: rect.x - gap - size.width, y: middleY, facing: "right" };
  const right: Placement = { x: rect.x + rect.width + gap, y: middleY, facing: "left" };
  const fitsLeft = left.x >= margin;
  const fitsRight = right.x + size.width <= viewport.width - margin;
  const comesFromLeft = from.x + size.width / 2 <= rect.x + rect.width / 2;

  let choice: Placement | null = null;
  if (comesFromLeft) choice = fitsLeft ? left : fitsRight ? right : null;
  else choice = fitsRight ? right : fitsLeft ? left : null;

  if (!choice) {
    const below = rect.y + rect.height + gap;
    const y = below + size.height <= viewport.height - margin ? below : rect.y - gap - size.height;
    // pe orizontală: cât mai aproape de unde vine, dar sub element
    const x = Math.min(Math.max(from.x, rect.x), rect.x + Math.max(0, rect.width - size.width));
    choice = { x, y, facing: x + size.width / 2 <= rect.x + rect.width / 2 ? "right" : "left" };
  }

  return { ...clampToViewport(choice, size, viewport, margin), facing: choice.facing };
}

/** Un pas de mers spre țintă, de cel mult `maxStep` pixeli. */
export function stepToward(from: Point, to: Point, maxStep: number): { point: Point; arrived: boolean } {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const distance = Math.hypot(dx, dy);
  if (distance <= maxStep) return { point: { ...to }, arrived: true };
  return { point: { x: from.x + (dx / distance) * maxStep, y: from.y + (dy / distance) * maxStep }, arrived: false };
}
