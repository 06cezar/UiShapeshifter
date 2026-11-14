// Pasul 4 (specs/10): ținte care apar pe rând, din ce în ce mai mici. Măsurăm dacă omul le nimerește din prima.
// Un click în zonă, dar pe lângă țintă, e o ratare. Enter/Space pe țintă trece mai departe (testul se poate face cu
// tastatura), dar nu măsoară degetul: încercarea e marcată `keyboard` și nu decide `minTargetPx`.

import { useRef, useState } from "react";
import type { PointerEvent } from "react";
import { TOUCH_TARGETS_PX, type TouchTrial } from "./result";

/**
 * După ce apare o țintă nouă, o apăsare pe lângă ea e ignorată atâta timp: al doilea click al unui dublu-click ar
 * cădea pe locul vechi și s-ar număra ca ratare, iar o singură ratare la 64px duce la butoane de 72px pe toate site-urile.
 */
export const TARGET_INPUT_GUARD_MS = 400;
/** După atâtea ratări trecem la ținta următoare, ca omul să nu se blocheze. */
const MAX_MISSES_PER_TARGET = 3;
/** Unde apare fiecare țintă în zonă, în procente (x, y): mereu în alt loc, dar la fel la fiecare rulare. */
const TARGET_POSITIONS: readonly [number, number][] = [
  [50, 50],
  [25, 30],
  [75, 70],
  [30, 75],
  [70, 25],
];

export interface TouchTestProps {
  onDone: (trials: TouchTrial[]) => void;
  /** Pentru teste: pauza după o țintă nouă (implicit TARGET_INPUT_GUARD_MS). */
  inputGuardMs?: number;
}

export function TouchTest({ onDone, inputGuardMs = TARGET_INPUT_GUARD_MS }: TouchTestProps) {
  const [index, setIndex] = useState(0);
  const [misses, setMisses] = useState(0);
  const trials = useRef<TouchTrial[]>([]);
  const shownAt = useRef(performance.now());
  /** Un pointerdown pe țintă înaintea click-ului: click-ul vine de la deget sau mouse, nu de la tastatură. */
  const pointerOnTarget = useRef(false);

  const sizePx = TOUCH_TARGETS_PX[index];
  const [x, y] = TARGET_POSITIONS[index % TARGET_POSITIONS.length];

  function finishTarget(hit: boolean, missCount: number, input: TouchTrial["input"]) {
    trials.current.push({
      sizePx,
      firstTryHit: hit && missCount === 0,
      misses: missCount,
      ms: Math.round(performance.now() - shownAt.current),
      input,
    });
    pointerOnTarget.current = false;
    if (index + 1 >= TOUCH_TARGETS_PX.length) {
      onDone(trials.current);
      return;
    }
    setIndex(index + 1);
    setMisses(0);
    shownAt.current = performance.now();
  }

  function onAreaPointerDown(event: PointerEvent<HTMLDivElement>) {
    if (event.target !== event.currentTarget) return; // a apăsat pe țintă, nu lângă
    if (performance.now() - shownAt.current < inputGuardMs) return; // restul unui dublu-click, nu o ratare
    const missCount = misses + 1;
    if (missCount >= MAX_MISSES_PER_TARGET) finishTarget(false, missCount, "pointer");
    else setMisses(missCount);
  }

  return (
    <div className="onboarding__touch">
      <p className="onboarding__progress" aria-live="polite">
        Ținta {index + 1} din {TOUCH_TARGETS_PX.length}
      </p>
      <div className="onboarding__touch-area" onPointerDown={onAreaPointerDown} data-agent-id="onboarding.touch.area">
        <button
          key={index}
          type="button"
          className="onboarding__touch-target"
          style={{ width: sizePx, height: sizePx, left: `${x}%`, top: `${y}%` }}
          aria-label={`Ținta ${index + 1} din ${TOUCH_TARGETS_PX.length}. Apasă aici.`}
          onPointerDown={() => (pointerOnTarget.current = true)}
          onClick={() => finishTarget(true, misses, pointerOnTarget.current ? "pointer" : "keyboard")}
          data-agent-id="onboarding.touch.target"
          autoFocus
        />
      </div>
    </div>
  );
}
