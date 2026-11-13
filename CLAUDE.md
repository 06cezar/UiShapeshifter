# CLAUDE.md

UI Shapeshifter: aplicație web de mesaje și poze pentru vârstnici, condusă de un agent AI (o vulpiță) care adaptează
interfața la om. Hackathon UiPath, 24 de ore: **vineri 13 nov. 14:00 → sâmbătă 14 nov. 14:00**.
Îngheț funcții sâmbătă 09:00, trimitere sâmbătă 13:30. Commit-urile de după 14:00 nu contează.

## Citește întâi
1. `CLAUDE.local.md`: cine ești în echipă, fluxul și taskurile tale (fiecare om îl are pe al lui, din `docs/agenti/`).
2. `specs/00-produs.md` și `specs/01-arhitectura.md`.
3. Specificațiile din `specs/` pentru taskurile tale și tipurile din `packages/contracts/src/`.
4. Graful: `git fetch origin dag && git show origin/dag:DAG.md`.

## Reguli
- **Contractele** (`packages/contracts/src/`) sunt sursa de adevăr pentru tot ce trece între web și server.
  Nu le schimbi fără să-i anunți pe cei afectați (`git comms send <cine> "…" --type contract`); vezi `specs/README.md`.
- **Accesibilitatea are prioritate.** Fontul minim e 16px (mai mare din profil), țintele ≥ 44px, contrast WCAG.
  Nicio schimbare, nici a agentului, nici a utilizatorului, nu trece sub limite (`HARD_LIMITS`, `specs/07`).
- **Agentul nu scrie cod sau HTML.** Schimbă interfața doar prin unelte: patch-uri pe `UIConfig` și componente din catalog.
- **Cheia OpenRouter doar pe server** (`apps/server/.env`), niciodată în browser, în loguri sau în git.
- Orice element interactiv are `data-agent-id` după convenția din `specs/04`.
- Nicio culoare sau mărime hardcodată: totul din temă (variabile CSS din `UIConfig.theme`).
- Texte pentru utilizator în română, scurte. Fără nume, logo-uri sau culori ale aplicațiilor reale.
- Doar date de test. Fără persoane reale în poze sau nume.
- **Calea cap-coadă care merge bate finisajele.** Întâi scenariul din `specs/12-demo.md`, apoi restul.

## Planul și graful
- Planul: `dag/tasks.yaml` (pe `main`, schimbat prin PR). Fiecare task are `branch:`; lucrează pe el.
- Graful îl scrie doar botul, pe branch-ul `dag`. Nu edita și nu comite `DAG.md` sau `dag/state.json`.
- Etichete în mesajele `git comms`: `[blocat ID de X]`, `[deblocat ID]`, `[gata ID]` (vezi `COMMS-RULES.md`).

## Comenzi
- `npm install`, apoi `npm run dev` (după taskul D1).
- `npm run check -w @uishapeshifter/contracts`: verifică tipurile comune.
- `python dag/build_dag.py --no-github --out <folder temporar>`: graful local, doar de probă.
