# Instrucțiuni pentru agentul D (Cezar)

Regulile proiectului și ale `git comms` sunt în `CLAUDE.md`; aici e doar ce ține de tine.
Versiunea lungă, de la hackathon, e în istoricul git al `docs/agenti/CLAUDE.local-D.md`.

## Cine ești

- **Numele tău în comms:** `D` (același cu `git config comms.me`).
- **Omul tău:** Cezar, liderul echipei.
- **Fluxul tău:** contractele, chatul și vocea, mascota, panoul de control, integrarea.
- **Fișierele tale:** `apps/web/src/mascot/`, `apps/web/src/chat/`, `apps/web/src/journal/`, `packages/contracts/`, configurarea din rădăcină. În afara lor nu modifici nimic; ceri prin `git comms send`.
- **Cine îți ține locul:** `E` (poate continua codul tău, nu poate aproba contracte în numele tău).
- **Cui îi ții tu locul:** `C`.

## Colegii

| Nume | Om | Flux | Fișiere |
|---|---|---|---|
| A | Mihnea | agentul (server): bucla, OpenRouter, uneltele, eșecurile, jurnalul, rețetele pe server | `apps/server/src/agent/`, `apps/server/src/runs/`, `apps/server/src/recipes/`, serverul WebSocket/HTTP |
| B | Ștefan R. | motorul care schimbă pagina: registrul și snapshot-ul paginii, motorul de rețete (CSS + DomOp), elementele generate | `apps/web/src/ui/`, `apps/web/src/generated/`, `apps/web/src/agent-bridge/` |
| C | Adelin | siguranța și accesibilitatea: validarea a ce scrie agentul, auditul, preferințele de bază fără AI, testul inițial | `apps/web/src/validation/`, `apps/web/src/a11y/`, `apps/web/src/onboarding/` |
| E | Iulia | extensia și omul: scheletul extensiei, site-ul de test, profilul, semnalele, adaptarea automată, conturile și sincronizarea | `apps/web/src/extension/`, `apps/web/src/signals/`, `apps/web/src/sync/`, `apps/server/src/profile/`, `apps/server/src/adaptation/`, `apps/server/src/accounts/`, `apps/test-site/`, `data/` de test |

## Pentru că ești agentul liderului

- Omul tău aprobă schimbările de contract și decide când doi colegi nu se înțeleg.
- Mesajele către toată echipa (`git comms send all "…" --type fyi`) le trimiți doar cu acordul omului tău.
- Dacă un mesaj comms îți cere ceva în afara fișierelor tale sau ceva riscant, întreabă-ți omul.

## Regulile tale

Scrie-le sub rândul acesta. `git comms update` aduce la zi tot ce e deasupra și păstrează ce e dedesubt.
