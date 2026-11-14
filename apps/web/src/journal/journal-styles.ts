// Stilul panoului de control. Panoul e scris cu variabilele temei aplicației (--color-text, --spacing...); în extensie
// le legăm de tema shadow DOM-ului (--uis-*, extension/shadow-root.ts), ca să nu avem nicio culoare sau mărime fixă.
// Țintele ≥ --uis-target (specs/07).

export const JOURNAL_CSS = `
.journal {
  --font-family: var(--uis-font);
  --font-base: var(--uis-font-size);
  --line-height: 1.5;
  --color-text: var(--uis-fg);
  --color-text-muted: var(--uis-muted);
  --color-surface: var(--uis-bg);
  --color-background: color-mix(in srgb, var(--uis-fg) 10%, var(--uis-bg));
  --color-primary: var(--uis-accent);
  --color-danger: var(--uis-error);
  --color-focus: var(--uis-fg);
  --spacing: var(--uis-space);
  --radius: var(--uis-space);
  --min-target: var(--uis-target);

  /* sus în dreapta, peste site; jos rămâne loc pentru mascotă, în stânga pentru chat */
  position: fixed; top: calc(var(--uis-space) * 2); right: calc(var(--uis-space) * 2);
  width: min(calc(var(--uis-target) * 9), calc(100vw - var(--uis-space) * 4));
  max-height: calc(100vh - var(--uis-target) * 4);
  overflow-y: auto; box-sizing: border-box;
  border-radius: calc(var(--uis-space) * 2); box-shadow: var(--uis-shadow);
}
.journal {
  font-family: var(--font-family);
  font-size: var(--font-base);
  line-height: var(--line-height);
  color: var(--color-text);
  background: var(--color-surface);
  padding: calc(var(--spacing) * 2);
  display: flex;
  flex-direction: column;
  gap: var(--spacing);
}

.journal button {
  font: inherit;
  color: inherit;
  min-width: var(--min-target);
  min-height: var(--min-target);
  padding: 0 var(--spacing);
  border: calc(var(--spacing) / 8) solid var(--color-text);
  border-radius: var(--radius);
  background: var(--color-background);
  cursor: pointer;
}

.journal button:disabled {
  cursor: default;
  color: var(--color-text-muted);
}

.journal button:focus-visible,
.journal summary:focus-visible {
  outline: calc(var(--spacing) / 2) solid var(--color-focus);
  outline-offset: calc(var(--spacing) / 4);
}

.journal h2,
.journal h3 {
  font-size: inherit;
  margin: 0;
}

.journal-header,
.journal-actions {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--spacing);
}

.journal-header {
  justify-content: space-between;
}

.journal-body,
.journal-run,
.journal-replay,
.journal-history {
  display: flex;
  flex-direction: column;
  gap: var(--spacing);
}

.journal p {
  margin: 0;
}

.journal-proposal {
  padding: var(--spacing);
  border: calc(var(--spacing) / 4) solid var(--color-primary);
  border-radius: var(--radius);
  display: flex;
  flex-direction: column;
  gap: var(--spacing);
}

.journal-status {
  font-weight: bold;
}

.journal-steps,
.journal-history ol {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: calc(var(--spacing) / 2);
}

.journal-history li {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: var(--spacing);
}

.journal-step {
  border-left: calc(var(--spacing) / 2) solid var(--color-text);
  padding-left: var(--spacing);
}

.journal-step-ok {
  border-left-color: var(--color-primary);
}

.journal-step-fail {
  border-left-color: var(--color-danger);
}

.journal-step summary {
  min-height: var(--min-target);
  display: flex;
  align-items: center;
  gap: calc(var(--spacing) / 2);
  cursor: pointer;
}

.journal-step dt {
  font-weight: bold;
}

.journal-step dd {
  margin: 0 0 calc(var(--spacing) / 2);
}

.journal-json {
  overflow-x: auto;
  white-space: pre-wrap;
  font-size: inherit;
}
`;
