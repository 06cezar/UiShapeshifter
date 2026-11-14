// Stilul chatului. Culorile și mărimile vin din tema extensiei (variabilele --uis-* din extension/shadow-root.ts);
// mărimile fixe sunt multipli ai țintei minime și ai spațiului de bază, ca să crească odată cu ele.

export const CHAT_CSS = `
.chat {
  position: fixed; left: calc(var(--uis-space) * 2); bottom: calc(var(--uis-space) * 2);
  display: flex; flex-direction: column; align-items: flex-start; gap: var(--uis-space);
  font: var(--uis-font-size)/1.5 var(--uis-font); color: var(--uis-fg);
}
.chat button, .chat input { font: inherit; }
.chat-launcher {
  min-height: var(--uis-target); min-width: var(--uis-target);
  padding: 0 calc(var(--uis-space) * 2);
  color: var(--uis-bg); background: var(--uis-accent);
  border: none; border-radius: var(--uis-radius); box-shadow: var(--uis-shadow); cursor: pointer;
}
.chat-panel {
  width: min(calc(var(--uis-target) * 9), calc(100vw - var(--uis-space) * 4));
  display: flex; flex-direction: column; gap: var(--uis-space);
  padding: calc(var(--uis-space) * 2);
  background: var(--uis-bg); border-radius: calc(var(--uis-space) * 2); box-shadow: var(--uis-shadow);
}
.chat-panel[hidden] { display: none; }
.chat-head { display: flex; align-items: center; justify-content: space-between; gap: var(--uis-space); }
.chat-title { margin: 0; font-weight: 600; }
.chat-close {
  min-height: var(--uis-target); min-width: var(--uis-target);
  color: var(--uis-fg); background: transparent; border: none; border-radius: var(--uis-radius); cursor: pointer;
}
.chat-log {
  display: flex; flex-direction: column; gap: var(--uis-space);
  max-height: calc(var(--uis-target) * 6); overflow-y: auto;
}
.chat-empty { margin: 0; color: var(--uis-muted); }
.chat-bubble {
  margin: 0; max-width: 85%; padding: var(--uis-space) calc(var(--uis-space) * 1.5);
  border-radius: calc(var(--uis-space) * 2); overflow-wrap: anywhere; white-space: pre-wrap;
}
.chat-bubble[data-role="user"] { align-self: flex-end; color: var(--uis-bg); background: var(--uis-accent); }
.chat-bubble[data-role="agent"] { align-self: flex-start; background: color-mix(in srgb, var(--uis-fg) 14%, var(--uis-bg)); }
.chat-bubble[data-error="true"] { border: 2px solid var(--uis-error); }
.chat-typing {
  margin: 0; align-self: flex-start; display: flex; gap: calc(var(--uis-space) / 2); align-items: center;
  padding: calc(var(--uis-space) * 1.25) calc(var(--uis-space) * 1.5);
  border-radius: calc(var(--uis-space) * 2); background: color-mix(in srgb, var(--uis-fg) 14%, var(--uis-bg));
}
.chat-typing[hidden] { display: none; }
.chat-dot {
  width: var(--uis-space); height: var(--uis-space); border-radius: 50%; background: var(--uis-muted);
  animation: chat-dot 1.2s ease-in-out infinite;
}
.chat-dot:nth-child(2) { animation-delay: 0.15s; }
.chat-dot:nth-child(3) { animation-delay: 0.3s; }
@keyframes chat-dot { 0%, 60%, 100% { opacity: 0.35; translate: 0 0; } 30% { opacity: 1; translate: 0 calc(var(--uis-space) / -2); } }
@media (prefers-reduced-motion: reduce) { .chat-dot { animation: none; } }
.chat-options { display: flex; flex-wrap: wrap; gap: var(--uis-space); }
.chat-option {
  min-height: var(--uis-target); min-width: var(--uis-target); padding: 0 calc(var(--uis-space) * 1.5);
  color: var(--uis-fg); background: color-mix(in srgb, var(--uis-fg) 10%, var(--uis-bg));
  border: 2px solid var(--uis-accent); border-radius: var(--uis-radius); cursor: pointer;
}
.chat-activity { margin: 0; color: var(--uis-muted); min-height: 1.5em; }
.chat-form { display: flex; gap: var(--uis-space); }
.chat-input {
  flex: 1; min-width: 0; min-height: var(--uis-target); padding: 0 calc(var(--uis-space) * 1.5);
  color: var(--uis-fg); background: color-mix(in srgb, var(--uis-fg) 10%, var(--uis-bg));
  border: 2px solid var(--uis-muted); border-radius: var(--uis-radius);
}
.chat-input::placeholder { color: var(--uis-muted); }
.chat-send {
  min-height: var(--uis-target); min-width: var(--uis-target); padding: 0 calc(var(--uis-space) * 2);
  color: var(--uis-bg); background: var(--uis-accent); border: none; border-radius: var(--uis-radius); cursor: pointer;
}
.chat-voice {
  min-height: var(--uis-target); min-width: var(--uis-target); padding: 0 var(--uis-space);
  color: var(--uis-fg); background: color-mix(in srgb, var(--uis-fg) 10%, var(--uis-bg));
  border: 2px solid var(--uis-muted); border-radius: var(--uis-radius); cursor: pointer;
}
.chat-voice[aria-pressed="true"] { color: var(--uis-bg); background: var(--uis-accent); border-color: var(--uis-accent); }
.chat-hint { margin: 0; color: var(--uis-warn); }
.chat button:focus-visible, .chat input:focus-visible { outline: 3px solid var(--uis-fg); outline-offset: 2px; }
.visually-hidden {
  position: absolute; width: 1px; height: 1px; margin: -1px; padding: 0; overflow: hidden;
  clip-path: inset(50%); white-space: nowrap; border: 0;
}
`;
