// Stilul mascotei. Culorile și mărimile vin din tema extensiei (variabilele --uis-* din extension/shadow-root.ts);
// mărimile sunt multipli ai țintei minime și ai spațiului de bază, ca să crească odată cu ele.

export const MASCOT_CSS = `
.mascot {
  position: fixed; left: 0; top: 0;
  /* de 3 ori cadrul de 33 px: pixeli întregi, fără neclaritate */
  width: calc(var(--uis-target) * 2.25); height: calc(var(--uis-target) * 2.25);
  pointer-events: none;
  font: var(--uis-font-size)/1.4 var(--uis-font); color: var(--uis-fg);
  will-change: transform;
}
.mascot-canvas { display: block; width: 100%; height: 100%; image-rendering: pixelated; }
.mascot[data-state="happy"] .mascot-canvas { animation: mascot-hop 0.5s ease-out 1; }
.mascot[data-no-model="true"] .mascot-canvas { display: none; }
.mascot-bubble {
  position: absolute; bottom: calc(100% - var(--uis-space)); right: 0;
  width: max-content; max-width: calc(var(--uis-target) * 6);
  margin: 0; padding: var(--uis-space) calc(var(--uis-space) * 1.5);
  background: var(--uis-bg); border: 2px solid var(--uis-accent);
  border-radius: calc(var(--uis-space) * 2); box-shadow: var(--uis-shadow);
  overflow-wrap: anywhere;
}
.mascot-bubble[hidden] { display: none; }
.mascot[data-bubble-below="true"] .mascot-bubble { bottom: auto; top: calc(100% - var(--uis-space)); }
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
@keyframes mascot-hop { 50% { transform: translateY(calc(var(--uis-space) * -2)); } }
@keyframes mascot-think { from { opacity: 1; } to { opacity: 0.8; } }
@media (prefers-reduced-motion: reduce) {
  .mascot-highlight, .mascot-canvas { animation: none !important; }
}
`;
