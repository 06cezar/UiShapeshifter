# Semnale de utilizare și adaptarea automată (etapa 4)

Tipurile: `packages/contracts/src/signals.ts` (`UsageSignal`, `AdaptationRule`, `AdaptationTrigger`, `Suggestion`).
Colectare: `apps/web/src/signals/` (content script, E2). Reguli: `apps/server/src/adaptation/` (E3).

Cerința mentorilor: produsul să se adapteze **singur**, după ce îl folosești mai mult. Regulile sunt cod fără AI;
agentul intră doar după ce o regulă s-a declanșat și omul a spus „da”, cu un scop clar și cu dovezile.

## Semnalele (content script)

| Semnal | Cum se detectează |
|---|---|
| `misclick` | click care nu lovește niciun element interactiv, la ≤ 24px de unul; `nearestElementId` = id din registru |
| `zoom` | `ctrl` + rotiță, `ctrl` + `+`, pinch (`visualViewport.scale`) |
| `back_loop` | aceeași zonă / pagină deschisă și închisă de ≥ 3 ori în 60 s (`moduleId` = id de zonă sau cale) |
| `dwell` | ≥ 20 s în aceeași zonă fără niciun click |
| `feature_use` | click pe un element interactiv (`elementId`, acțiunea) |
| `help_request` | „ajutor” în chat sau click pe mascotă fără mesaj |
| `proposal_decision` | Păstrez / Anulez pe o propunere |

Semnalele pleacă în loturi (`signals`, cel mult o dată la 5 s, cu `page` = unde s-au întâmplat) și se păstrează pe
server pe sesiune. Nu trimitem textul din câmpuri și nu citim parole: doar poziții și id-uri.

## Regulile (server)

| Regulă (`AdaptationRule`) | Se declanșează când | Scopul dat agentului | Risc |
|---|---|---|---|
| `small-targets` | ≥ 3 `misclick` în 2 min lângă același element | „Ratează des <element>: mărește țintele.” | low |
| `font-too-small` | ≥ 2 `zoom` cu scale > 1.2 în 5 min | „Mărește textul; își face zoom.” | low |
| `lost-in-navigation` | un `back_loop`, sau `dwell` + `help_request` | „Pare pierdut în <zonă>: simplifică sau ghidează.” | high |
| `frequent-path` | aceeași secvență de ≥ 3 click-uri, de ≥ 3 ori | „Face des <acțiune>: propune o scurtătură.” → `apply_ops` cu `inject` | high |
| `unused-module` | o zonă neatinsă în ultimele 3 vizite, celelalte folosite | „Nu folosește <zonă>: propune să o scoți.” | high |
| `general-preferences` | site fără rețetă, iar omul are preferințe generale neaplicate acolo | „Aplică pe <site> preferințele lui generale: <listă>.” | high |
| `repeat-request` | aceeași cerere pe ≥ 2 site-uri | „Cere des <lucru>: propune să devină preferință generală.” → `update_profile` | low |

- O regulă nu se mai declanșează pentru același element 10 minute după o rulare, sau niciodată după un „Anulez”
  pentru aceeași schimbare (ținut minte ca fapt în profil).
- În demo, pragurile se pot coborî cu `ADAPT_DEMO=1` (ex. 2 ratări în loc de 3).
- `general-preferences` se declanșează la **prima vizită** pe un site fără rețetă, o singură dată pe site.

## Propunerea (`Suggestion`)

Când o regulă se declanșează, serverul trimite `ServerMessage.suggestion`: bulă discretă la mascotă, **fără fereastră care
blochează**, cu două butoane mari („Da” / „Nu”). Omul răspunde cu `suggestion_decision` (`accept` | `dismiss`).

- `accept` → serverul pornește o rulare cu `goal` din propunere și `origin: "adaptation"`; rezultatul trece prin
  previzualizare și Păstrez / Anulez ca orice rulare.
- `dismiss` → regula nu se mai repetă pentru același element sau site; se salvează ca fapt în profil.
- **Schimbare mică (`risk: low`) și `trust.autoApplyLowRisk`:** se aplică direct, animat, iar mascota anunță („Am mărit
  puțin butoanele. Apasă aici dacă vrei înapoi.”). `autoApplyLowRisk` devine `true` după 3 propuneri păstrate la rând și
  `false` la primul „Anulez”.
- Nicio rulare de adaptare nu pornește cât timp omul scrie sau e în mijlocul unui ghidaj.
