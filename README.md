# UI Shapeshifter

> Aplicația care se schimbă după tine, nu tu după ea.

UiPath Future Forward Hackathon 2026, tema **Agents in Action**.

O aplicație de mesaje și poze pentru vârstnici, condusă de un agent AI (o vulpiță animată). Agentul:

- face un **test inițial** (cât de mare trebuie să fie textul, cât de mari butoanele, ce folosești des);
- **adaptează interfața** la om, cu accesibilitatea pe primul loc: font minim, contrast, ținte mari;
- **generează elemente noi la cerere** („vreau s-o sun pe Ana mai repede” → o placă mare „Sună-o pe Ana”);
- **te ghidează pas cu pas**, arătând cu lăbuța, și se adaptează când apeși greșit;
- **ține minte** cine ești (un profil ca un ICP) și **se adaptează singur** din felul în care folosești aplicația;
- îți arată tot ce face, pas cu pas, cu **Păstrez / Anulez** și reluarea oricărei rulări.

## Unde găsești ce

| Ce | Unde |
|---|---|
| Produsul, cerințele juriului, scenariul demo | [`specs/00-produs.md`](specs/00-produs.md), [`specs/12-demo.md`](specs/12-demo.md) |
| Arhitectura și cine ce face | [`specs/01-arhitectura.md`](specs/01-arhitectura.md) |
| Contractele (tipurile comune) | [`packages/contracts/src/`](packages/contracts/src/) și [`specs/`](specs/README.md) |
| Planul (taskuri, dependențe) | [`dag/tasks.yaml`](dag/tasks.yaml) |
| Graful „cine pe cine așteaptă” | branch-ul `dag`: [`DAG.md`](../../blob/dag/DAG.md) (apare după prima rulare a workflow-ului `dag`) |
| Etichetele pentru graf | [`COMMS-RULES.md`](COMMS-RULES.md) |
| Instrucțiunile fiecărui agent | [`docs/agenti/`](docs/agenti/) |

## Pornire

Scheletul (taskul D1) nu e încă făcut. După D1:

```bash
npm install
npm run dev
```

Web pe http://localhost:5173, server pe http://localhost:8787. Cheia OpenRouter în `apps/server/.env`
(`OPENROUTER_API_KEY`, `OPENROUTER_MODEL`), niciodată în git.

## Echipa

A Mihnea · B Ștefan R. · C Adelin · D Cezar (lider) · E Iulia
