// Desenează vulpea (Sunny Land, ansimuz, CC0) pe un canvas din shadow DOM-ul nostru, cadru cu cadru.
// Cadrele vin din octeți (fox-sprites.ts) prin createImageBitmap: nimic cerut prin URL, nimic de blocat de CSP-ul site-ului.
// Canvas-ul are mărimea cadrului (33×33); CSS-ul îl mărește, cu pixelii păstrați (image-rendering: pixelated).

import { IDLE_ANIMATION, type SpriteAnimation } from "./animations";
import { FOX_SPRITES, type FoxSheet } from "./fox-sprites";
import type { Facing } from "./geometry";

/** Interfața de care are nevoie mascota; testele dau una falsă (happy-dom nu decodează imagini). */
export interface MascotRenderer {
  play(animation: SpriteAnimation): void;
  /** Cadrele privesc spre dreapta; „left” le oglindește. „front” = când stă în colț, privind spre pagină. */
  face(facing: Facing | "front"): void;
  dispose(): void;
}

export type CreateRenderer = (
  canvas: HTMLCanvasElement,
  options: { reducedMotion: boolean },
) => Promise<MascotRenderer>;

/** Cadrele au 33×32 px; canvas-ul e pătrat, cu vulpea lipită de marginea de jos. */
const FRAME_WIDTH = 33;
const FRAME_HEIGHT = 32;
const CANVAS_SIZE = 33;
/** În colțul din dreapta, „față” înseamnă privind spre pagină, adică spre stânga. */
const FRONT_FACING: Facing = "left";

async function decode(base64: string): Promise<ImageBitmap> {
  const bytes = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
  return createImageBitmap(new Blob([bytes], { type: "image/png" }));
}

export const createSpriteRenderer: CreateRenderer = async (canvas, { reducedMotion }) => {
  const entries = await Promise.all(
    (Object.keys(FOX_SPRITES) as FoxSheet[]).map(
      async (sheet) => [sheet, await Promise.all(FOX_SPRITES[sheet].map(decode))] as const,
    ),
  );
  const frames = new Map<FoxSheet, ImageBitmap[]>(entries);
  canvas.width = CANVAS_SIZE;
  canvas.height = CANVAS_SIZE;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("canvas 2d indisponibil");
  context.imageSmoothingEnabled = false;

  let animation: SpriteAnimation = IDLE_ANIMATION;
  let startedAt = performance.now();
  let facing: Facing = FRONT_FACING;
  let frame = 0;
  let lastDrawn = "";

  function draw(now: number) {
    const sheet = frames.get(animation.sheet) ?? [];
    const elapsed = ((now - startedAt) / 1000) * animation.fps;
    // Cu reducedMotion: doar primul cadru al fiecărei animații, fără mișcare continuă.
    let index = reducedMotion ? 0 : Math.floor(elapsed);
    if (!animation.loop && index >= sheet.length) {
      animation = IDLE_ANIMATION;
      startedAt = now;
      index = 0;
    }
    const image = sheet[index % Math.max(1, sheet.length)];
    const key = `${animation.sheet}:${index % Math.max(1, sheet.length)}:${facing}`;
    if (image && key !== lastDrawn) {
      lastDrawn = key;
      context!.clearRect(0, 0, CANVAS_SIZE, CANVAS_SIZE);
      context!.save();
      if (facing === "left") {
        context!.translate(CANVAS_SIZE, 0);
        context!.scale(-1, 1);
      }
      context!.drawImage(image, 0, CANVAS_SIZE - FRAME_HEIGHT, FRAME_WIDTH, FRAME_HEIGHT);
      context!.restore();
    }
    frame = requestAnimationFrame(draw);
  }
  frame = requestAnimationFrame(draw);

  return {
    play(next) {
      if (next.sheet === animation.sheet && next.loop === animation.loop) {
        animation = next; // aceeași foaie (ex. idle → pointing): fără să o luăm de la capăt
        return;
      }
      animation = next;
      startedAt = performance.now();
    },
    face(next) {
      facing = next === "front" ? FRONT_FACING : next;
    },
    dispose() {
      cancelAnimationFrame(frame);
      for (const sheet of frames.values()) for (const image of sheet) image.close();
    },
  };
};
