# Accesibilitatea: limitele, preferințele de bază și auditul (etapele 2–3)

Tipurile: `packages/contracts/src/audit.ts` (`AuditReport`, `AuditIssue.fixCss`), `HARD_LIMITS` în `ui-config.ts`.

Ideea principală a produsului e **schimbarea UI-ului unui site după om**; accesibilitatea e o parte din ea, cu limite pe
care nu le încalcă nimeni, nici agentul, nici cererea. Fontul minim e criteriu explicit al juriului. Se aplică pe trei
niveluri, în ordinea asta:

1. **Auditul după fiecare schimbare** (`audit_ui`, C2): rulează pe pagina așa cum arată acum, după ce agentul a aplicat
   CSS sau operații. Ce cade sub limite se **repară cu CSS** (`fixCss`) sau se **anulează** (revizia dinainte).
2. **Preferințele de bază, fără AI** (C4): din profil, pe orice site, ca o foaie separată a extensiei, aplicată **ultima**,
   peste tot ce a scris agentul. Un site nou are fontul minim de la prima încărcare, fără niciun apel la model.
3. **Limita rămâne tare:** fontul minim din profil nu poate fi coborât de rețeta agentului, fiindcă foaia de bază vine
   după ea și are prioritate (`!important` pe proprietățile limitate, doar în foaia noastră).

## Pragurile

| Regulă | Prag | Sursa |
|---|---|---|
| `min-font` | text ≥ `max(16px, profile.needs.minFontPx)`; **fontul minim global e 16px** | cerința juriului; WCAG 1.4.4 |
| `contrast` | text normal ≥ 4.5:1; text mare (≥ 24px sau ≥ 18.66px bold) ≥ 3:1; cu `contrast: "high"`: 7:1 și 4.5:1 | WCAG 1.4.3 / 1.4.6 |
| `contrast` (UI) | margini de butoane, iconițe ≥ 3:1 | WCAG 1.4.11 |
| `target-size` | ținte de click ≥ `max(44px, profile.needs.minTargetPx)` pe ambele dimensiuni | WCAG 2.5.5 |
| `overlap` | două elemente interactive vizibile nu se suprapun (intersecție > 4px²) | – |
| `clipped` | textul nu e tăiat (`scrollWidth > clientWidth + 1`, fără `text-overflow` intenționat) | WCAG 1.4.10 |
| `offscreen` | niciun element interactiv în afara ecranului pe orizontală | WCAG 1.4.10 |
| `line-height` | ≥ 1.5 pentru textul de conținut | WCAG 1.4.12 |

Toate sunt `error`, cu excepția `line-height` și `contrast` pe text decorativ, care sunt `warning`.
Interfața noastră (mascota, chatul, panoul) se verifică separat și nu blochează.

**Pe site-uri reale** un site poate avea de la început texte sub limită. Auditul distinge ce a stricat agentul de ce
era deja așa: `audit_ui` verifică pagina de două ori, o dată cum e acum și o dată cu rețeta oprită pentru o clipă (în
același pas sincron, deci nu se vede), și pune `introduced: true` pe problemele care nu erau pe pagina fără rețetă
(aceeași regulă, același element). Doar acestea îl obligă pe agent la reparație sau anulare; ce era deja sub limită
îl repară preferințele de bază (nivelul 2). Oprirea rețetei o dă motorul de rețete (B5), ca funcție `pauseRecipe`.

Pe o pagină reală auditul măsoară cel mult 300 de elemente cu text propriu sau interactive, cele din ecran întâi
(`MAX_AUDITED_ELEMENTS` în `a11y/page-audit.ts`), ca unealta să răspundă repede după fiecare schimbare.
`{ regionId }` verifică doar o zonă din `PageSnapshot`.

## Scorul (pentru panou și pitch)

`score = max(0, 100 − 8 × erori − 2 × avertismente)`, pe elementele vizibile din pagină. Panoul arată scorul înainte și
după fiecare rulare; cifrele din pitch sunt cele măsurate.

## Reparațiile (`fixCss`)

Auditul propune CSS când reparația e evidentă; agentul îl trimite lui `apply_css` (append). Declarațiile au
`!important`: altfel o regulă mai specifică a site-ului câștigă, auditul următor pică din nou și agentul repară în cerc.
Selectorul e cel din registru (`PageElement.selector`), iar `fixCss` trece mereu de validarea CSS (C5).

| Problemă | `fixCss` propus |
|---|---|
| font sub minim | `selector { font-size: <minim>px }` |
| contrast text/fundal | `selector { color: <varianta mai închisă/deschisă a aceleiași nuanțe care atinge pragul> }` |
| țintă mică | `selector { min-height: <prag>px; min-width: <prag>px }` (plus `display: inline-block` pentru un element inline) |
| text tăiat | fără `fixCss`; decide agentul (mai puțin text, mai multă înălțime) |

Funcțiile de contrast (luminanță relativă, raport, ajustarea unei culori până la prag) stau în `apps/web/src/a11y/` și
au teste cu valori cunoscute (ex. `#777777` pe alb = 4.48:1).

## Preferințele de bază (C4)

- Intrare: `profile.needs` (`minFontPx`, `contrast`, `minTargetPx`, `reducedMotion`).
- Ieșire: o foaie de stil a extensiei, separată de rețeta agentului, care ridică fontul sub minim, țintele sub prag și
  contrastul sub prag pe orice site; se pune **după** rețetă și se actualizează când se schimbă profilul.
- Ce nu face: nu schimbă structura și nu ascunde nimic; doar aduce pagina la limite.
- Pe site-uri cu probleme de lizibilitate cunoscute (iframe-uri din alt domeniu), rămâne ce nu poate atinge; auditul îl notează.
