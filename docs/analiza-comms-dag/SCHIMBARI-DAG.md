# Graful de taskuri: schimbări față de versiunea de la hackathonul UiPath

Scris pe 15 nov. 2026, după analiza din `UiShapeshifter/ANALIZA-DAG.md`. Folosește fișierul ca context când
aduci la zi `CLAUDE.md` și `CLAUDE.local-*.md` pentru proiectul următor (secțiunea 3).

- **Versiunea de referință („curentă”):** cea din repo-ul UiShapeshifter, `origin/main`, ultimul commit pe
  `dag/build_dag.py` e `7e3a08d` (13 nov.). Înainte de schimbări, fișierele de aici erau identice cu ea.
- **Unde sunt schimbările:** doar în folderul `tasks-depend-DAG`. Repo-ul UiShapeshifter și repo-ul comms **nu au fost atinse**.
- **Cum vezi diferența:** `git diff --no-index UiShapeshifter/dag/build_dag.py tasks-depend-DAG/dag/build_dag.py` (la fel pentru `.github/workflows/dag.yml`, `dag/notify_ready.py`).

## 1. Ce s-a schimbat (4 lucruri, toate cu teste)

| # | Schimbare | Înainte | Acum | De ce (măsurat la hackathon) |
|---|---|---|---|---|
| 1 | **PR-urile se leagă și după prefixul branch-ului** | conta doar branch-ul scris în `branch:` (sau `pr:`) | un PR deschis sau unit de pe `<id>-…` (`c3-fixuri`, `d6-pitch`; și `<id>_…`, `<id>/…`, fără deosebire de majuscule) face taskul **în lucru** | 29 de PR-uri pe 16 taskuri nu se vedeau; D6 și E4 au apărut „așteaptă” până la final, cu 6 PR-uri unite |
| 2 | **Vedere pe om:** `dag/pe-om/<om>.md` pe branch-ul `dag` | agentul citea `DAG.md` întreg (~10 k caractere) | un fișier sub ~1 000 de caractere: taskurile lui care nu sunt gata, de ce, și cine îl așteaptă | D a citit graful de 33 de ori, de 19 ori filtrat cu `grep`; 9 citiri în 24 de minute la M2 |
| 3 | **Anunțul „poate începe” trimite la fișierul omului** | „… Graful: DAG.md pe branch-ul dag.” | „… Starea ta: dag/pe-om/D.md pe branch-ul dag.” | ca anunțul să nu împingă agentul înapoi la graful întreg |
| 4 | **Workflow fără rulări duble** | `pull_request: [opened, reopened, closed, synchronize]` | fără `synchronize` | 306 din 547 de commit-uri au pornit două rulări (un `push` și un `synchronize`) |

Detalii care contează:

- **Prefixul nu face niciodată taskul „gata”.** Gata rămâne doar din PR-ul legat exact (`pr:`/`branch:`) sau din
  `[gata ID]`. Motivul: un task are adesea mai multe PR-uri pe prefix (A6 a avut 4), iar primul unit nu înseamnă că
  taskul e terminat. Când toate PR-urile de pe prefix sunt unite, graful scrie „taskul nu e marcat gata”.
- `d10-x` nu e al lui D1; `d-demo` nu e al nimănui; un PR închis fără merge nu contează; un `d1-fixuri` deschis după
  ce D1 e unit nu îl întoarce din „gata”.
- Fișierele din `dag/pe-om/` urmează regulile lui `DAG.md`: deterministe, scrise doar dacă diferă, deci nu aduc
  commit-uri în plus. Fișierul unui om ieșit din plan se șterge.
- Workflow-ul comite acum cu `git add -A DAG.md dag` (prinde și fișierele noi sau șterse din `dag/pe-om/`).

Cum arată vederea lui D pe datele de la finalul hackathonului (441 de caractere, față de 9 700 `DAG.md`):

```
# D: 12/15 gata

- 🟢 poate începe: **M4** PUNCT DE CONTROL 4 - „fă-l să arate ca X” pe perechea din demo, propu…
- 🔨 în lucru: **D6** Pitch de 5 minute, …: PR #159 unit (`d6-readme`), PR #165 unit (`d6-pitch`), PR #166 unit (`d6-pitch-cifre`); taskul nu e marcat gata; încă așteaptă D5
- ⏳ așteaptă: **D5**: M4

Te așteaptă: M4 ← D5 (D); D5 ← E4 (E), D6 (D)
```

Fișiere atinse: `dag/build_dag.py` (`prefix_prs`, `_prefix_why`, `derive`, `render_owner`, `write_owner_files`, `run`;
+115 rânduri), `dag/notify_ready.py` (`message`), `.github/workflows/dag.yml`, `dag/tests/test_7_prefix_pe_om.py` (nou,
17 teste), `.gitignore`, plus documentația uneltei (`AGENTS.md`, `CLAUDE.md`, `dag/README.md`, `docs/GHID-OAMENI.md`,
`IDEI.md`, `COMMS-RULES.md`) și șabloanele `instructiuni-agenti/CLAUDE.local-{A..E}.md` (secțiunea 3, punctele 1–7).

**Verificat:** `python -m pytest dag/tests -q` → 95 trec (78 vechi, neschimbate, plus 17 noi). Pașii workflow-ului au
mers local, cap-coadă, pe planul și cele 166 de PR-uri reale: build, `git add -A`, commit, push, a doua rulare fără commit.
**Neverificat:** nimic din toate acestea n-a rulat pe GitHub Actions. Prima rulare pe un repo real e de urmărit.
Arhivele `dag-handoff.zip` și `sisteme-echipa.zip` din folder sunt dinaintea schimbărilor.

## 2. Ce NU am schimbat, deși analiza le recomandă, și de ce

Am aplicat doar ce e sigur și stă în întregime în unealta grafului. Restul cere o decizie sau atinge comms.

| Recomandare din analiză | De ce nu acum |
|---|---|
| Punct de control ca o comandă cu două trepte (`git comms checkpoint M3 probat/ok/pică`) și `ask` către lider | E protocol nou în `comms.py` (alt repo, altă sesiune lucrează la el) și cere decizia ta: cine are voie să pună „ok” |
| Starea omului direct în `git comms brief` | Tot în `comms.py`. Acum e simplu de făcut: `brief` doar afișează `origin/dag:dag/pe-om/<eu>.md` dacă există |
| „Poate începe” să ceară și dependențele indirecte (M4 a apărut liber înaintea lui M3) | Schimbă sensul stării pentru orice plan, nu doar pentru punctele de control; nu sunt sigur că e mereu ce vrei |
| `state.json` să țină doar PR-urile din plan (237 de commit-uri în minus) | Riscant fără un pas în plus: când planul primește un `branch:` nou, un PR vechi deja unit nu ar mai fi știut |
| Lista „în afara planului”, pe om | Graful nu știe al cui e un PR (ține doar branch-ul și starea); ar trebui citit autorul și legat de numele din comms |
| Scos blocul Mermaid din `DAG.md` | Nu mai e nevoie: agenții citesc acum `dag/pe-om/`, iar `DAG.md` rămâne pentru oameni |

## 3. Ce se schimbă în `CLAUDE.md` și `CLAUDE.local-*.md`

**Stare:** punctele 1–7 sunt **aplicate în cele cinci șabloane** din `instructiuni-agenti/CLAUDE.local-{A..E}.md`
(fiecare a crescut cu ~530 de caractere). **Neaplicate:** punctele 8–13 (cer decizia ta), `CLAUDE.md` al proiectului
(secțiunea „Planul și graful”, vezi punctul 2) și fișierele din `UiShapeshifter/docs/agenti/`, care mai descriu versiunea veche.
Mai jos, întâi ce **trebuie** schimbat ca să se potrivească cu codul nou, apoi ce **recomand** din analiză.

### Obligatoriu (altfel regulile contrazic unealta) — făcut în șabloane

1. **„La începutul fiecărei sesiuni”, pasul 2.** În loc de `git show origin/dag:DAG.md` și „caută subgraful tău”:
   ```bash
   git fetch origin dag
   git show origin/dag:dag/pe-om/<NUME>.md
   ```
   „Sunt doar taskurile tale care nu sunt gata și cine te așteaptă. Graful întreg (`origin/dag:DAG.md`) îl citești doar
   dacă ai nevoie de taskurile altcuiva.”
2. **Regula de nume pentru branch-uri** (nouă, în „Fluxul unui task” și în `CLAUDE.md`, „Planul și graful”):
   „Orice branch pe care lucrezi la un task începe cu id-ul lui: `d6-pitch`, `c3-fixuri`. Graful îl vede singur ca
   «în lucru». Branch-urile fără id (`d-demo-…`) nu apar în graf.”
3. **„Cum deduce graful starea unui task”, regula 5:** adaugă „sau un PR, deschis ori unit, de pe un branch `<id>-…`”.
   Și propoziția: „Un astfel de PR nu face taskul gata; gata vine din PR-ul de pe branch-ul scris în plan sau din eticheta de gata.”
4. **Paragraful „Legarea PR-ului de task e treaba ta”:** rămâne adevărat doar pentru „gata”. Pentru „în lucru” ajunge
   numele branch-ului. Textul nou: „Ca taskul să ajungă gata singur, PR-ul lui principal stă pe branch-ul din `branch:`.”
5. **„Dacă ceva nu merge”**, rândul „taskul tău rămâne «poate începe» deși lucrezi”: cauza nouă e „branch-ul nu începe
   cu id-ul taskului sau n-are încă PR”.
6. **Exemplul de anunț** din „Graful îți scrie”: textul se termină acum cu „Starea ta: dag/pe-om/<NUME>.md pe branch-ul dag.”
7. **Tabelul „trei branch-uri”:** pe `dag` stau acum `DAG.md`, `dag/pe-om/<om>.md` și `dag/state.json`.
   „Ce nu faci niciodată”: nu editezi nici `dag/pe-om/`.

### Recomandat (din analiză; nu depinde de cod) — nefăcut

8. **Taskurile fără cod nu primesc `branch:`.** D5 („scenariul merge de 3 ori”) avea `branch: d5-integrare` și n-a putut
   ajunge gata niciodată. Probele, pitch-ul și punctele de control se închid cu eticheta de gata.
9. **Scoate din fișierele non-liderilor** „Cum deduce graful starea unui task”, „Etichetele” și rândurile aferente din
   „Dacă ceva nu merge” (~3,4 k caractere, ~1,1 k tokeni la fiecare apel). A, B, C și E n-au pus nicio etichetă în 24 de ore.
   Pune în loc un rând: „Lucrezi pe `<id>-…`; etapele le marchează liderul. Detalii: `COMMS-RULES.md`.”
10. **Scoate `[blocat …]` și `[deblocat …]` din ce citește toată echipa** (0 folosiri reale; blocajele s-au discutat ca
    fire `ask`). Codul le acceptă în continuare; rămân descrise în `COMMS-RULES.md`.
11. **Scoate copia planului („Taskurile tale”, 1,9–4,4 k caractere) din `CLAUDE.local`.** Nu se actualizează când planul
    se schimbă; `dag/pe-om/<NUME>.md` e mereu la zi. Lasă doar: „Taskurile tale: `owner: <NUME>` în `dag/tasks.yaml`.”
12. **La lider:** „M3 probat de altcineva nu e M3 marcat. Dacă un punct de control stă «poate începe» mai mult de o oră
    după ora-țintă, îl marchezi pe baza probei unui coleg sau spui echipei ce pică.” (M3 a stat 8 h 45 min, deși A și E îl probaseră.)
13. **Planul se ține la zi și după prima seară:** 132 din 166 de PR-uri n-au avut task, iar `tasks.yaml` n-a mai fost
    atins după vineri 18:57. O regulă scurtă pentru lider: la fiecare punct de control, adaugă în plan ce s-a lucrat în afara lui.

## 4. Cum ajunge în proiectul următor

1. Copiază din `tasks-depend-DAG`: `dag/build_dag.py`, `dag/notify_ready.py`, `dag/tests/`, `.github/workflows/dag.yml`,
   `COMMS-RULES.md`, `dag/README.md`.
2. Pornește de la șabloanele din `instructiuni-agenti/` (au deja punctele 1–7) și adaugă în `CLAUDE.md` al proiectului,
   la „Planul și graful”, regula de nume a branch-urilor (punctul 2) și citirea `dag/pe-om/<NUME>.md` (punctul 1).
3. La prima rulare pe GitHub, verifică: apare `dag/pe-om/` pe branch-ul `dag`; un push pe un branch cu PR deschis
   pornește o singură rulare; anunțul are textul nou.
