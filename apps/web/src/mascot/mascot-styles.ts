// Stilul mascotei. Culorile și mărimile vin din tema extensiei (variabilele --uis-* din extension/shadow-root.ts);
// mărimile sunt multipli ai țintei minime și ai spațiului de bază, ca să crească odată cu ele.

import {
  DANCE_BAR_MS,
  DANCE_BEAT_MS,
  DANCE_FINALE_BARS,
  DANCE_FINALE_TURNS_PER_BAR,
  DANCE_MS,
  DANCE_STEADY_BARS,
} from "./animations";

/**
 * Unde stă ratonul în cadru (235×200), măsurat pe cadrele de dans: între x 73–194 și y 6–167. Restul cadrului e gol
 * (loc pentru căderea pe spate), deci „mijlocul ratonului” nu e mijlocul cutiei: în jurul lui se învârte la dans.
 */
const FRAME_WIDTH_PX = 235;
const FRAME_HEIGHT_PX = 200;
const RACCOON_CENTER_X_PERCENT = 57; // privind spre dreapta; oglindit (spre stânga) e 100 - 57
const RACCOON_CENTER_Y_PERCENT = 43;
/** Discul de dans, cât din lățimea cutiei: destul cât să încapă ratonul întors pe orice parte. */
const DISC_WIDTH_PERCENT = 76;

/** Rotirea din dans: ture în ritm normal, apoi finalul de două ori mai repede (animations.ts). */
const SPIN_STEADY_END_PERCENT = (100 * DANCE_STEADY_BARS) / (DANCE_STEADY_BARS + DANCE_FINALE_BARS);
const SPIN_STEADY_TURNS = DANCE_STEADY_BARS;
const SPIN_TOTAL_TURNS = DANCE_STEADY_BARS + DANCE_FINALE_BARS * DANCE_FINALE_TURNS_PER_BAR;

export const MASCOT_CSS = `
.mascot {
  position: fixed; left: 0; top: 0;
  width: calc(var(--uis-target) * 3); aspect-ratio: ${FRAME_WIDTH_PX} / ${FRAME_HEIGHT_PX};
  pointer-events: none;
  font: var(--uis-font-size)/1.4 var(--uis-font); color: var(--uis-fg);
  will-change: transform;
  --mascot-center-x: ${100 - RACCOON_CENTER_X_PERCENT}%; --mascot-center-y: ${RACCOON_CENTER_Y_PERCENT}%;
  --mascot-disc-radius: calc(var(--uis-target) * 3 * ${DISC_WIDTH_PERCENT / 2 / 100});
}
.mascot[data-facing="right"] { --mascot-center-x: ${RACCOON_CENTER_X_PERCENT}%; }
.mascot-canvas { display: block; width: 100%; height: 100%; }
/* Scena de dans: discul din spate, ratonul (canvas-ul) și notele, toate prinse de mijlocul ratonului. Rotirea, mărirea
   și apariția sunt animații separate pe proprietăți separate (rotate, scale), ca să se combine fără să se calce. */
.mascot-stage { position: relative; width: 100%; height: 100%; }
.mascot-canvas { position: relative; transform-origin: var(--mascot-center-x) var(--mascot-center-y); }
.mascot-disc, .mascot-note {
  display: none; position: absolute; left: var(--mascot-center-x); top: var(--mascot-center-y); translate: -50% -50%;
}
.mascot-disc {
  width: ${DISC_WIDTH_PERCENT}%; aspect-ratio: 1; box-sizing: border-box;
  border-radius: 50%; border: 2px solid var(--uis-bg); box-shadow: var(--uis-shadow);
  background: repeating-conic-gradient(
    color-mix(in srgb, var(--uis-accent) 92%, var(--uis-bg)) 0deg 30deg,
    color-mix(in srgb, var(--uis-accent) 40%, var(--uis-fg)) 30deg 60deg
  );
}
.mascot-note {
  color: var(--uis-accent); font-weight: 700; font-size: calc(var(--uis-font-size) * 1.6); line-height: 1;
  text-shadow: 0 0 calc(var(--uis-space) / 2) var(--uis-bg);
  opacity: 0;
}
/* Dansul (happy): ratonul se învârte în cerc ca un disc de pick-up, o tură pe măsură, și „pulsează” la fiecare bătaie;
   în ultima măsură se învârte de două ori mai repede. Discul din spate se rotește invers, iar notele sar de pe marginea
   lui, câte una pe bătaie. */
.mascot[data-state="happy"] .mascot-canvas {
  animation: mascot-spin ${DANCE_MS}ms linear both, mascot-beat ${DANCE_BEAT_MS}ms ease-out infinite;
}
.mascot[data-state="happy"] .mascot-disc {
  display: block;
  animation: mascot-disc-show ${DANCE_MS}ms ease-out both, mascot-disc-turn ${DANCE_BAR_MS * 2}ms linear infinite;
}
.mascot[data-state="happy"] .mascot-note {
  display: block;
  animation: mascot-note ${DANCE_BAR_MS}ms ease-out infinite;
  animation-delay: calc(var(--i) * ${DANCE_BEAT_MS}ms);
}
.mascot[data-no-model="true"] .mascot-canvas { display: none; }
.mascot-bubble {
  position: absolute; bottom: calc(100% - var(--uis-space)); right: 0;
  /* pe un ecran îngust, nu mai lată decât ecranul */
  width: max-content; max-width: min(calc(var(--uis-target) * 6), calc(100vw - var(--uis-space) * 4));
  margin: 0; padding: var(--uis-space) calc(var(--uis-space) * 1.5);
  background: var(--uis-bg); border: 2px solid var(--uis-accent);
  border-radius: calc(var(--uis-space) * 2); box-shadow: var(--uis-shadow);
  overflow-wrap: anywhere;
}
.mascot-bubble[hidden] { display: none; }
/* Gândul agentului cât lucrează: margine punctată și „…” care pulsează, ca să nu semene cu un mesaj terminat. */
.mascot-bubble[data-kind="thought"] { border-style: dashed; }
.mascot-dots { display: inline-flex; gap: calc(var(--uis-space) / 2); margin-left: var(--uis-space); vertical-align: middle; }
.mascot-dot {
  width: calc(var(--uis-space) * 0.75); height: calc(var(--uis-space) * 0.75); border-radius: 50%;
  background: var(--uis-accent); animation: mascot-dot 1.2s ease-in-out infinite;
}
.mascot-dot:nth-child(2) { animation-delay: 0.15s; }
.mascot-dot:nth-child(3) { animation-delay: 0.3s; }
@keyframes mascot-dot { 0%, 60%, 100% { opacity: 0.35; } 30% { opacity: 1; } }
.mascot[data-bubble-below="true"] .mascot-bubble { bottom: auto; top: calc(100% - var(--uis-space)); }
.mascot[data-bubble-align="left"] .mascot-bubble { right: auto; left: 0; }
.mascot[data-state="thinking"] .mascot-canvas { animation: mascot-think 1.2s ease-in-out infinite alternate; }
.mascot-highlight {
  position: fixed; left: 0; top: 0;
  box-sizing: border-box; pointer-events: none;
  border: 3px solid var(--uis-accent); border-radius: var(--uis-space);
  outline: calc(var(--uis-space) / 2) solid color-mix(in srgb, var(--uis-accent) 35%, transparent);
  animation: mascot-pulse 1s ease-in-out infinite alternate;
}
.mascot-highlight[hidden] { display: none; }
@keyframes mascot-pulse { from { outline-offset: 0; } to { outline-offset: var(--uis-space); } }
@keyframes mascot-spin {
  0% { rotate: 0turn; }
  ${SPIN_STEADY_END_PERCENT}% { rotate: ${SPIN_STEADY_TURNS}turn; }
  100% { rotate: ${SPIN_TOTAL_TURNS}turn; }
}
@keyframes mascot-beat { from { scale: 1.16; } to { scale: 1; } }
@keyframes mascot-disc-show {
  0% { scale: 0; }
  5% { scale: 1.12; }
  9%, 94% { scale: 1; }
  100% { scale: 0; }
}
@keyframes mascot-disc-turn { from { rotate: 0turn; } to { rotate: -1turn; } }
/* Nota pleacă de pe marginea discului, pe direcția --angle (0 = în sus), și rămâne dreaptă cât zboară. */
@keyframes mascot-note {
  0% {
    opacity: 0;
    transform: rotate(var(--angle)) translateY(calc(var(--mascot-disc-radius) * -0.9)) rotate(calc(var(--angle) * -1)) scale(0.6);
  }
  10% { opacity: 1; }
  45%, 100% {
    opacity: 0;
    transform: rotate(var(--angle)) translateY(calc(var(--mascot-disc-radius) * -1.6)) rotate(calc(var(--angle) * -1)) scale(1.2);
  }
}
@keyframes mascot-think { from { opacity: 1; } to { opacity: 0.8; } }
@media (prefers-reduced-motion: reduce) {
  .mascot-highlight, .mascot-canvas, .mascot-disc, .mascot-dot { animation: none !important; }
  .mascot-note { display: none !important; }
}
`;
