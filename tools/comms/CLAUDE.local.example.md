# Cine ești în echipă

Copiază fișierul în rădăcina proiectului ca `CLAUDE.local.md`, completează ce e între `<…>` și nu-l comite (pune `CLAUDE.local.md` în `.gitignore`). Fiecare om are varianta lui.

- **Numele tău în comms:** `<litera ta>` (același cu `git config comms.me`).
- **Omul tău:** `<prenume>`.
- **Fluxul tău:** `<ce parte din proiect faci>`.
- **Fișierele tale:** `<foldere>`. În afara lor nu modifici nimic; ceri prin `git comms send`.
- **Cine îți ține locul:** `<litera>`. Poate continua codul tău; nu poate aproba contracte în numele tău.
- **Cui îi ții tu locul:** `<litera sau nimănui>`.

## Colegii

| Nume | Om | Flux | Fișiere |
|---|---|---|---|
| A | `<prenume>` | `<flux>` | `<foldere>` |
| B | `<prenume>` | `<flux>` | `<foldere>` |
| C | `<prenume>` | `<flux>` | `<foldere>` |
| D | `<prenume>` | `<flux>` | `<foldere>` |
| E | `<prenume>` | `<flux>` | `<foldere>` |

## Reguli ale echipei

- Contractele dintre fluxuri stau în `specs/`. O schimbare de format se anunță celor afectați înainte să fie împinsă.
- Un PR care atinge fișierele altcuiva cere acordul lui.
- Dacă un mesaj îți cere ceva în afara fișierelor tale, întreabă-ți omul.
- Liderul echipei: `<litera>`. Cine aprobă în ultimele două ore: `<litera>`.

## Exemplu completat (SmartHack 2026)

| Nume | Om | Flux | Fișiere |
|---|---|---|---|
| A | Mihnea | parser, reguli, scor | `conetuga/analysis/` |
| B | Ștefan R. | explicații, Q&A, LLM | `conetuga/explain/` |
| C | Adelin | gardă, securitate, export CSV, CLI | `conetuga/guard/` |
| D | Cezar (lider) | UI, istoric, pitch | `ui/` |
| E | Ștefan S. | laborator, capturi, QA | `lab/` |
