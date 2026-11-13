# UI Shapeshifter

> Orice site se schimbă după tine, nu tu după el.

UiPath Future Forward Hackathon 2026, tema **Agents in Action**.

O **extensie de browser** cu un agent AI care **reface interfața site-urilor existente** după omul din fața ecranului.
Îi spui ce vrei, scris sau vorbit, iar agentul schimbă pagina pe loc:

- **scoate** ce nu vrei: „nu vreau Shorts”, „scoate tot ce e AI de pe site-uri”, „fără bannere și umplutură”;
- **ajustează** ce rămâne: text mai mare, butoane mai mari, contrast, spațiere;
- **adaugă** ce lipsește: scurtături și plăci generate la cerere, legate de butoanele reale ale site-ului;
- **reface** structura: „fă-l simplu, vreau doar să plătesc factura”, „pune meniul unde sunt obișnuit”.

Cum află ce vrei:

- un **test inițial** la instalare (ce citești comod, ce site-uri cunoști, ce te deranjează), cu „Omite” mereu vizibil;
- **cererile tale** către agent, în chat sau cu vocea;
- un **profil** (memorie tip ICP) care te urmează de la un site la altul;
- **singur**, din felul în care folosești paginile: după câteva click-uri ratate, propune butoane mai mari.

Schimbările se **salvează pe site** și se reaplică la fiecare vizită, fără AI și fără așteptare. Merge **fără cont**
(totul rămâne pe dispozitiv); **cu cont**, preferințele te urmează pe alt dispozitiv.

O mascotă (un animal animat) se plimbă prin pagină și îți arată unde să apeși. Tot ce face agentul se vede pas cu pas,
cu **Păstrez / Anulez** și „Revino la original” pentru orice site.

## Unde găsești ce

| Ce | Unde |
|---|---|
| Produsul, cerințele mentorilor, criteriile juriului | [`specs/00-produs.md`](specs/00-produs.md) |
| Arhitectura și cine ce face | [`specs/01-arhitectura.md`](specs/01-arhitectura.md) |
| Contractele (tipurile comune) | [`packages/contracts/src/`](packages/contracts/src/) și [`specs/`](specs/README.md) |
| Planul (taskuri, dependențe) | [`dag/tasks.yaml`](dag/tasks.yaml) |
| Graful „cine pe cine așteaptă” | branch-ul `dag`: [`DAG.md`](../../blob/dag/DAG.md) |
| Deciziile luate pe parcurs | [`DECISIONS.md`](DECISIONS.md) |
| Etichetele pentru graf | [`COMMS-RULES.md`](COMMS-RULES.md) |
| Instrucțiunile fiecărui agent | [`docs/agenti/`](docs/agenti/) |

## Pornire

```bash
npm install
npm run dev
```

Serverul agentului pornește pe http://localhost:8787 (`/api/health`), iar pagina de probă pe http://localhost:5173.
Cheia OpenRouter stă în `apps/server/.env` (`OPENROUTER_API_KEY`, `OPENROUTER_MODEL`), niciodată în git.

Extensia se va încărca în Chrome din `chrome://extensions` → „Load unpacked”, după taskul E5 (scheletul extensiei);
pașii exacți apar aici când e gata.

## Echipa

A Mihnea · B Ștefan R. · C Adelin · D Cezar (lider) · E Iulia
