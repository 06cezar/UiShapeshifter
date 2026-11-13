# Accesibilitatea: limitele și auditul

Tipurile: `packages/contracts/src/audit.ts`, `HARD_LIMITS` în `ui-config.ts`.

Accesibilitatea e **criteriul principal** al oricărei schimbări (cerință de la juriu). Se aplică pe două niveluri:

1. **Poarta din store** (`02-ui-config.md`): refuză orice patch care încalcă limitele la nivel de config. Nimeni nu trece de ea.
2. **Auditul pe DOM-ul randat** (`audit_ui`): prinde ce nu se vede din config (text tăiat, suprapuneri,
   un element generat prea mic, contrast pe o imagine). Agentul îl rulează după orice schimbare vizuală.

## Pragurile

| Regulă | Prag | Sursa |
|---|---|---|
| `min-font` | text ≥ `max(16px, profile.needs.minFontPx)`. **Fontul minim global e 16px**; pentru Maria, din test, 20px | cerința juriului; WCAG 1.4.4 |
| `contrast` | text normal ≥ 4.5:1; text mare (≥ 24px sau ≥ 18.66px bold) ≥ 3:1; cu `contrast: "high"`: 7:1 și 4.5:1 | WCAG 1.4.3 / 1.4.6 |
| `contrast` (UI) | margini de butoane, iconițe ≥ 3:1 | WCAG 1.4.11 |
| `target-size` | ținte de click ≥ `max(44px, profile.needs.minTargetPx)` pe ambele dimensiuni | WCAG 2.5.5 |
| `overlap` | două elemente interactive vizibile nu se suprapun (intersecție > 4px²) | – |
| `clipped` | textul nu e tăiat (`scrollWidth > clientWidth + 1`, fără `text-overflow` intenționat) | WCAG 1.4.10 |
| `offscreen` | niciun element interactiv în afara ecranului pe orizontală | WCAG 1.4.10 |
| `line-height` | ≥ 1.5 pentru textul de conținut | WCAG 1.4.12 |

Toate sunt `error`, cu excepția `line-height` și `contrast` pe text decorativ, care sunt `warning`.
Elementele interfeței agentului (`mascot`, `chat-panel`, `journal-panel`) se verifică separat, nu blochează.

## Scorul (pentru panou și pitch)

`score = max(0, 100 − 8 × erori − 2 × avertismente)`, calculat pe elementele vizibile din modulul curent.
Panoul arată scorul înainte și după fiecare rulare.

## Reparațiile (`fix`)

Auditul propune patch-uri când reparația e evidentă:

| Problemă | `fix` propus |
|---|---|
| font sub minim (din temă) | `/theme/baseFontPx` = minimul |
| contrast text/fundal | `/theme/palette/text` = varianta mai închisă (sau mai deschisă) a aceleiași nuanțe care atinge pragul |
| țintă mică | `/minTargetPx` = pragul |
| text tăiat într-un element generat | `size` mai mic sau text mai scurt; altfel fără `fix`, decide agentul |

Funcțiile de contrast (luminanță relativă, raport, ajustarea unei culori până la prag) stau în `apps/web/src/a11y/`
și sunt folosite și de poarta din store. Au teste unitare cu valori cunoscute (ex. `#777777` pe alb = 4.48:1).
