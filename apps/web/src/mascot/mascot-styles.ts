// Stilul mascotei. Culorile și mărimile vin din tema extensiei (variabilele --uis-* din extension/shadow-root.ts);
// mărimile sunt multipli ai țintei minime și ai spațiului de bază, ca să crească odată cu ele.

export const MASCOT_CSS = `
.mascot {
  position: fixed; left: 0; top: 0;
  /* cadrele ratonului au 235×200 */
  width: calc(var(--uis-target) * 3); aspect-ratio: 235 / 200;
  pointer-events: none;
  font: var(--uis-font-size)/1.4 var(--uis-font); color: var(--uis-fg);
  will-change: transform;
}
.mascot-canvas { display: block; width: 100%; height: 100%; }
/* Scena: umbra sub picioare, stratul care sare, canvas-ul care se rotește și notele. Fiecare strat are animația lui,
   ca rotirea, săritura și notele să se combine fără să se calce una pe alta. */
.mascot-stage { position: relative; width: 100%; height: 100%; perspective: calc(var(--uis-target) * 12); }
.mascot-hop { width: 100%; height: 100%; transform-origin: 50% 100%; }
.mascot-shadow, .mascot-note { display: none; position: absolute; }
.mascot-shadow {
  left: 28%; right: 28%; bottom: 0; height: 9%;
  border-radius: 50%; background: color-mix(in srgb, var(--uis-bg) 30%, transparent);
}
.mascot-note {
  left: calc(18% + var(--i) * 28%); bottom: 55%;
  color: var(--uis-accent); font-weight: 700; font-size: calc(var(--uis-font-size) * 1.6); line-height: 1;
  text-shadow: 0 0 calc(var(--uis-space) / 2) var(--uis-bg);
  opacity: 0;
}
/* Dansul (happy): se învârte lin pe loc, ca pe un platou, sare în ritm cu turtire la aterizare, iar notele urcă. */
.mascot[data-state="happy"] { --mascot-dance-turn: 1.5s; --mascot-dance-beat: calc(var(--mascot-dance-turn) / 4); }
.mascot[data-state="happy"] .mascot-canvas { animation: mascot-spin var(--mascot-dance-turn) linear infinite; }
.mascot[data-state="happy"] .mascot-hop { animation: mascot-bounce var(--mascot-dance-beat) ease-in-out infinite; }
.mascot[data-state="happy"] .mascot-shadow { display: block; animation: mascot-shadow var(--mascot-dance-beat) ease-in-out infinite; }
.mascot[data-state="happy"] .mascot-note {
  display: block;
  animation: mascot-note var(--mascot-dance-turn) ease-out infinite;
  animation-delay: calc(var(--i) * var(--mascot-dance-turn) / 3);
}
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
@keyframes mascot-spin { from { transform: rotateY(0deg); } to { transform: rotateY(360deg); } }
@keyframes mascot-bounce {
  0%, 100% { transform: translateY(0) scale(1.08, 0.9); }
  35% { transform: translateY(calc(var(--uis-space) * -1.5)) scale(0.95, 1.06); }
  55% { transform: translateY(calc(var(--uis-space) * -2.5)) scale(1, 1); }
}
@keyframes mascot-shadow {
  0%, 100% { transform: scale(1); opacity: 1; }
  55% { transform: scale(0.6); opacity: 0.5; }
}
@keyframes mascot-note {
  0% { opacity: 0; transform: translate(0, 0) rotate(-12deg) scale(0.6); }
  20% { opacity: 1; }
  100% { opacity: 0; transform: translate(calc(var(--uis-space) * 3 * var(--dx)), calc(var(--uis-space) * -7)) rotate(14deg) scale(1.1); }
}
@keyframes mascot-think { from { opacity: 1; } to { opacity: 0.8; } }
@media (prefers-reduced-motion: reduce) {
  .mascot-highlight, .mascot-canvas, .mascot-hop, .mascot-shadow { animation: none !important; }
  .mascot-note { display: none !important; }
}
`;
