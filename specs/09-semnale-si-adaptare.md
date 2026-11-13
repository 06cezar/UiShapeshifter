# Semnale de utilizare și adaptarea automată

Tipurile: `packages/contracts/src/signals.ts`. Colectare: `apps/web/src/signals/`. Reguli: `apps/server/src/adaptation/`.

Cerința juriului: aplicația să se adapteze **singură**, după ce o folosești mai mult. Regulile sunt cod fără AI;
agentul intră doar după ce o regulă s-a declanșat, cu un scop clar și cu dovezile.

## Semnalele (frontend)

| Semnal | Cum se detectează |
|---|---|
| `misclick` | click care nu lovește niciun element interactiv, la ≤ 24px de unul; `nearestElementId` = cel mai apropiat |
| `zoom` | `ctrl` + rotiță, `ctrl` + `+`, pinch (`visualViewport.scale`) |
| `back_loop` | același modul deschis și închis de ≥ 3 ori în 60 s |
| `dwell` | ≥ 20 s într-un modul fără niciun click |
| `feature_use` | click pe un element interactiv (`elementId`, acțiunea) |
| `help_request` | „ajutor” în chat sau click pe mascotă fără mesaj |
| `proposal_decision` | Păstrez / Anulez pe o propunere |

Semnalele pleacă în loturi (`signals`, cel mult o dată la 5 s) și se păstrează pe server pe sesiune.

## Regulile (server)

| Regulă | Se declanșează când | Scopul dat agentului | Risc |
|---|---|---|---|
| `small-targets` | ≥ 3 `misclick` în 2 min lângă același element | „Ratează des <element>: mărește țintele sau elementul.” | low |
| `font-too-small` | ≥ 2 `zoom` cu scale > 1.2 în 5 min | „Mărește textul; își face zoom.” | low |
| `lost-in-navigation` | un `back_loop` sau `dwell` + `help_request` | „Pare pierdut în <modul>: oferă ghidaj sau simplifică meniul.” | high |
| `frequent-path` | aceeași secvență de ≥ 3 click-uri spre același contact sau acțiune, de ≥ 3 ori | „Face des <acțiune>: propune o scurtătură.” → `generate_component` | high |
| `unused-module` | un modul nedeschis în ultimele 3 sesiuni, iar celelalte folosite | „Nu folosește <modul>: propune să-l muți la final sau să-l ascunzi.” | high |

- O regulă nu se mai declanșează pentru același element 10 minute după o rulare, sau niciodată după un „Anulez”
  pentru aceeași schimbare (se salvează ca fapt în profil).
- În demo, pragurile se pot coborî cu `ADAPT_DEMO=1` (ex. 2 ratări în loc de 3).

## Cât de „seamless”

- **Schimbare mică (`risk: low`) și `trust.autoApplyLowRisk`:** agentul o aplică direct, animat, iar mascota spune
  „Am mărit puțin butoanele, păreau greu de apăsat. Apasă aici dacă vrei înapoi.”
- **Altfel:** mascota face o propunere discretă (bulă, fără fereastră care blochează): „Văd că o suni des pe Ana.
  Vrei un buton mare pentru asta?” → previzualizare → Păstrez/Anulez.
- `autoApplyLowRisk` devine `true` după 3 propuneri păstrate la rând și `false` la primul „Anulez”.
- Nicio rulare de adaptare nu pornește cât timp omul scrie sau e în mijlocul unui ghidaj.
