// Pasul 4 (specs/10): ținte care apar pe rând, din ce în ce mai mici. Măsurăm dacă omul le nimerește din prima.
// Un click în zonă, dar pe lângă țintă, e o ratare. Cu tastatura, Enter pe țintă contează ca nimerit.

import { useRef, useState } from "react";
import type { PointerEvent } from "react";
import { TOUCH_TARGETS_PX, type TouchTrial } from "./result";

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
}

export function TouchTest({ onDone }: TouchTestProps) {
  const [index, setIndex] = useState(0);
  const [misses, setMisses] = useState(0);
  const trials = useRef<TouchTrial[]>([]);
  const shownAt = useRef(performance.now());

  const sizePx = TOUCH_TARGETS_PX[index];
  const [x, y] = TARGET_POSITIONS[index % TARGET_POSITIONS.length];

  function finishTarget(hit: boolean, missCount: number) {
    trials.current.push({
      sizePx,
      firstTryHit: hit && missCount === 0,
      misses: missCount,
      ms: Math.round(performance.now() - shownAt.current),
    });
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
    const missCount = misses + 1;
    if (missCount >= MAX_MISSES_PER_TARGET) finishTarget(false, missCount);
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
          onClick={() => finishTarget(true, misses)}
          data-agent-id="onboarding.touch.target"
          autoFocus
        />
      </div>
    </div>
  );
}
