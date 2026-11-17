# Analiza grafului de taskuri (DAG) la hackathonul UiPath, 13–14 nov. 2026

## Verdict
1. **Botul și-a atins toate țintele tehnice:** 1037 de rulări, 0 picate, 845/845 sub un minut cap-coadă (mediana 16 s), PR unit → graf în 11 s, 0 tokeni pentru rutină (la SmartHack: 34 de reîmprospătări cu AI, ~6,7 M tokeni).
2. **Ca hartă a muncii a acoperit o cincime:** 132 din 166 de PR-uri n-au avut task, planul n-a mai fost atins după vineri 18:57, iar 3 taskuri lucrate (D5, E4, D6) apar „așteaptă” până la final.
3. **Punctele de control au fost partea cea mai valoroasă și veriga cea mai slabă:** toată echipa a vorbit în ele (67 de mesaje pomenesc M0–M4), dar M3 a stat 8 h 45 min „poate începe” deși A și E îl probaseră, iar M4 a rămas nemarcat.
4. **Legătura cu comms a mers într-un singur sens util:** anunțurile de la `dag` au ajuns la D în 1–4 minute; etichetele au fost folosite doar de D, doar `[gata Mx]` (4 reale din 643 de mesaje), iar `[blocat]`/`[deblocat]` niciodată.
5. **Tokeni: ~1% din consumul lui D la rulare, dar construcția și reparațiile au costat cât un SmartHack de reîmprospătări.** Se amortizează de la a doua folosire; valoarea a fost aproape toată la lider.

Legendă: **[M]** = măsurat (sursa în paranteză), **[D]** = dedus, **[?]** = nu se poate ști din date. Orele sunt locale (UTC+2). Sesiunile sunt citate cu primele 8 caractere din id.

## 1. Corectitudine: a arătat starea reală?
- [M] 40 de taskuri, toate `status: auto`, 33 cu `branch:`, 0 cu `pr:` (`origin/main:dag/tasks.yaml`). 32 trecute pe „gata” din PR, **niciuna întoarsă din „gata”** (cele 330 de commit-uri `origin/dag:dag/state.json`).
- [M] Gata doar prin etichetă: M0–M3. Starea finală e 36/40: **D5, E4, D6 apar „așteaptă” deși s-a lucrat la ele** (B a rulat D5 de la 08:40, mesajul `0840-B-e7s`; `e4-*` și `d6-*` au 6 PR-uri unite), iar M4 apare „poate începe” de la 04:35.
- [M] **132/166 de PR-uri fără task** (`gh pr list --state all`, `headRefName` care nu e în `branch:`). 29 dintre ele încep cu id-ul unui task (`a6-scope-…`, `c3-fixuri`), pe 16 taskuri; restul de 103 sunt reparații, prompturi, demo (D 45, A 39, C 20, E 17, B 10, după prima literă).
- [M] „Gata” înseamnă „PR unit”, nu „criteriul din `note` e adevărat”: la 00:47 și 00:52 D notează „graful va arăta C3 gata la unire, deși «la instalare se deschide testul» nu e adevărat” (f6591034, 025e8b6a); lucrul lipsă (#63) „nu e în niciun task” (`0053-D-sb7`).
- [M] „Poate începe” se uită doar la dependențele directe: M4 a devenit „poate începe” la 04:35 cu M3 nemarcat, fiindcă B4, A4, E3, E6 fuseseră unite înaintea lui M3.
- [M] 2 taskuri pe același branch (B2 și B5 pe `b5-retete`) au mers corect.

## 2. Latență și fiabilitate
- [M] `dag.yml`: 1037 de rulări (`gh api …/workflows/dag.yml/runs`): 845 reușite, 192 anulate (înlocuite în coada `concurrency`), **0 picate, 0 reluate**. De la eveniment la sfârșit: mediana 16 s, p90 27 s, maxim 53 s; ~252 de minute reale.
- [M] **Facturate sunt 845 de minute, nu 252:** fiecare rulare reușită se rotunjește la un minut. Asta face $5,07, din care **$4,83 plătiți** (raportul de facturare GitHub pe noiembrie): repo-ul era privat, iar creditul lunar de $18 îl consumase deja CI-ul de la Cone Tuga. E singurul cost în bani al celor două unelte.
- [M] De la PR unit la starea „gata” pe `dag`: mediana 11 s, maxim 24 s, pe toate cele 32 de taskuri. Riscul din `IDEI.md` (căutarea GitHub rămâne în urmă) nu a apărut. De la etichetă la graf: M0 18 s, M1 26 s, M2 31 s, M3 27 s.
- [M] 330 de push-uri pe `dag`, 0 conflicte. Doar **63 de commit-uri au schimbat o stare**, 29 doar textul; **237 (72%) au scris doar cursorul și cache-ul de PR-uri** (în 235 din ele s-a schimbat `prs`: sunt PR-urile din afara planului).
- [M] 475 de rulări au venit din `pull_request`, 556 din `push`; 306 din 547 de SHA-uri au pornit ambele. Din cele 387 de rulări reușite pornite de PR-uri, 354 au fost pe un commit care avusese deja o rulare reușită din `push`. `dag` a fost singura verificare de pe PR-uri (e1853702, sâm 00:30).
- [M] `dag-trigger.yml`: 742 de rulări, 736 sărite (0 minute), 6 au pornit graful (6 minute facturate, $0,04). E zgomot în lista Actions, nu cost.
- [M] Unealta a fost reparată de două ori în timpul hackathonului: etichete cu literă mică, liste, punctuație (`ce58deb`, vin 14:59) și „în lucru înaintea dependențelor” (`7e3a08d`, vin 15:59).
- [?] Dacă GitHub a desenat corect blocul Mermaid nu se vede din git și nu apare în nicio sesiune a lui D.

## 3. Ce voia să rezolve upgrade-ul și ce a ieșit
Sursa țintelor: `tasks-depend-DAG/docs/DAG-PLAN.md`, `IDEI.md`, `AGENTS.md` („Ce NU a fost verificat”) și sesiunile c526a027, 85f69f31, e790bd53.

| Ce voia | Rezultat | Dovada |
|---|---|---|
| Zero tokeni la rutină (față de ~6,7 M la SmartHack) | **rezolvat** | [M] 845 de rulări fără niciun apel la model |
| Citire incrementală, sub un minut la fiecare push | **rezolvat** | [M] maxim 53 s; prețul: 237 de commit-uri fără efect vizibil |
| Botul în afara lui `main` (branch `dag`) | **rezolvat** | [M] 0 push-uri respinse, 0 conflicte |
| Plan editabil de oricine prin PR | **parțial** | [M] 6 commit-uri, 5 ale lui D și 1 al lui E, niciunul după vin 18:57 |
| AI doar când se schimbă planul | **parțial** | [M] pivotul s-a făcut într-o sesiune (d9b26405), dar D a mai citit graful de 33 de ori și planul de 27 |
| Etichete din mesajele comms (legătura comms → graf) | **folosit îngust** | [M] 4 `[gata Mx]` reale; 0 `[blocat]`, 0 `[deblocat]` în afara probei |
| Anunțul „poate începe” (graf → comms) | **parțial** | [M] 16 anunțuri, 0 duplicate; util în prima oră și la punctele de control (§4) |
| Legarea automată a PR-urilor după numele branch-ului (`IDEI.md` 1) | **nefăcut, a lipsit** | [M] 29 de PR-uri cu prefix de task nevăzute; D6 și E4 fără stare |
| Vedere pe om (`IDEI.md` 3) | **nefăcut, a lipsit** | [M] D a filtrat graful cu `grep` în 19 din 33 de citiri |
| Verificarea planului în PR (`IDEI.md` 4) | **nefăcut, n-a lipsit** | [M] niciun plan stricat, 0 rulări picate |

## 4. Legătura cu comms: anunțuri și etichete
- [M] **16 anunțuri** (`from: dag` pe `origin/comms`), 0 duplicate; 10 la D, 6 la alții. După pivot (17:25), unul singur la altcineva (E7 → E). Taskurile noi în plan nu se anunță (`newly_ready`): D7 și E5 n-au primit anunț.
- [M] De la anunț la primul push: A1 15, B1 8, E1 14, D4 12, B2 13, D8 7, D3 7, E7 39, D2 76, D9 92 min (mediana ~13). **19 din 32 de taskuri au început înainte să fie „poate începe”** (wait→progress), deci n-au avut ce anunț să primească. 2 anunțuri (B2, B4, vin 16:06) au fost depășite de pivot într-o oră.
- [M] La D, anunțul a ajuns la agent repede când o sesiune era deschisă: M0 în 1 min (2b378498, vin 18:38: „Graful a trimis «M0 poate începe»”), M3 în 4 min (caa8fde0, sâm 02:08), M4 în 1 min (b7a2c5e6, sâm 04:36). [?] La A, B, E nu se vede; nimeni n-a răspuns unui mesaj `dag`.
- [M] **6 mesaje cu etichete din 643**, toate de la D: proba `ZZ9` (2) și `[gata M0…M3]`. Scrise greșit sau puse ca exemplu: 0. Lipsesc `gata M4` și `gata D6`.
- [M] În schimb, **67 de mesaje pomenesc M0–M4 în cuvinte** (D 30, C 14, A 13, E 7, B 3): „le unesc după M3”, „A6 ține M3”. Doar 12 pomenesc graful sau planul, 10 de la D. Blocajele s-au discutat ca fire `ask` (180), nu ca stări.
- [M] `git comms brief` nu arată nimic din graf (`comms.py` știe de graf doar prin marcajul `[dag]` pe commit); agentul citește `git show origin/dag:DAG.md` separat. Id-urile mesajelor `dag` sunt în UTC, ale oamenilor în ora locală (`1312-dag-…` e de la 15:12).
- [D] A meritat: `[gata Mx]` ca poartă între etape și anunțul către lider. N-a meritat locul din reguli: `[blocat]`/`[deblocat]` și „cum deduce graful”, pentru patru agenți care n-au pus nicio etichetă.

## 5. Planul și punctele de control
- [M] 6 commit-uri pe `tasks.yaml` (`git log --follow`): planul (vin 14:41), D1 (15:11), pivotul (17:25, +107/−54), etapele (17:36, +249/−134), B2/B5 la E (18:07), branch comun (18:57). Apoi 19 ore fără nicio schimbare.
- [M] Față de ținte: M0 18:55 (19:30), M1 21:38 (22:00), M2 00:39 (01:00) au ținut. **M3 10:49 (ținta 03:30, posibil de la 02:04); M4 nemarcat.**
- [M] M3 n-a fost uitat, a așteptat omul: A l-a probat la 02:47, E la 02:51, B la 08:26, dar regula era „D îl marchează după ce omul a văzut”. Agentul lui D scrie repetat „M3 rămâne nemarcat până îl vezi tu” (b7a2c5e6, 04:16 și 07:43). La 04:04 D a dat drumul unirilor fără el (`0404-D-dtq`).
- [M] M4 a fost probat la 10:58 și a picat pasul 1 pe Bing (853d0527); n-a mai fost reluat. La 12:23: „graful acum arată greșit: M4 nu e marcat, așa că D5, D6 și E4 apar toate «așteaptă»” (ef8a4ec5).
- [M] 8 taskuri unite înaintea dependențelor: C5, C2, C4, apoi A4 și A5 (02:55, la 13 minute după ce A scria „le unesc după M3”), E3, E6, B4 (04:07–04:35).
- [M] Graful are un singur `owner` pe task. Între 00:15 și 00:40 C a preluat și a dat înapoi taskurile lui D (M2–M4); în acest timp nimeni nu știa cine marchează M2.
- [D] Etapele au ținut ordinea până la M2. După aceea poarta a fost un om ocupat, iar echipa a ocolit-o cu bună știință.

## 6. Dovezi din sesiunile lui D: unde a ajutat și unde a încurcat
**A ajutat**
- [M] vin 15:12: D1 unit → A1, B1, E1 anunțate și începute în 8–15 min.
- [M] vin 21:12 (3becdae5): „M1 e singurul tău task care poate începe și pe el îl așteaptă B6, A3, D2, D9 și E2.”
- [M] vin 22:57–23:04 (a1cdd240): din graf, „D9 neînceput” și „B6 e gâtul de sticlă pentru M2” → mesajul `2316-D-qr3` către C; B6 unit la 23:40.
- [M] sâm 00:54 (d0cf0f4f): „gâtul de sticlă e E8”, citit din „Cel mai lung lanț rămas”; E8 unit la 01:40.

**A încurcat sau a fost ocolit**
- [M] sâm 00:30–00:54, în jurul lui M2: **9 citiri ale grafului în 24 de minute, din 7 sesiuni paralele ale lui D**. Una notează: „graful citește doar mesajele `git comms`, nu WhatsApp; pentru el M2 e încă «poate începe»” (d7ce366a, 00:35).
- [M] 23 din cele 78 de sesiuni ale lui D au citit `DAG.md`; fiecare sesiune nouă îl recitește, fiindcă starea nu vine în `brief`.
- [M] D5 avea `branch:` deși e o probă fără cod, deci nu putea ajunge „gata” nici prin PR, nici (fără M4) prin ordine.
- [M] `dag` verde a fost citat ca verificare a unui PR (cdc041f5, sâm 12:53), deși nu spune nimic despre cod.

## 7. Costul în tokeni (măsurat pe mașina lui D)
- [M] Consumul lui D în fereastra hackathonului, cu sesiunile bifurcate numărate o dată: 78 de sesiuni, 3073 de apeluri (raportul lui D, cu altă deduplicare: 3 064), 7,33 M tokeni noi, 630 M citiți din cache, 1,84 M scriși.
- [M] Reguli despre graf în fiecare apel: 5,1 k caractere în șase secțiuni din `CLAUDE.local`, 6,5 k cu bucățile din „Ce nu faci” și „Dacă ceva nu merge”, plus 0,6 k în `CLAUDE.md`: **~7,1 k caractere ≈ 2,3 k tokeni** [D: ~3 caractere pe token]. La 3073 de apeluri: ~7,1 M tokeni din cache, **1,1%** din 630 M. În plus, „Taskurile tale” e o copie a planului (1,9–4,4 k caractere) care nu se actualizează.
- [M] Citiri: 33 ale `DAG.md` (14 întreg sau `head`, ~10 k caractere bucata; 19 filtrate), 27 ale `tasks.yaml` (raportul lui D: 29), 10 scrieri, 6 rulări locale. Rezultatele au **cel mult 334 k caractere ≈ 110 k tokeni, 1,5% din contextul nou** (unele comenzi aduc și altceva).
- [M] `DAG.md` are între 8,3 k și 19,7 k caractere (vârf vin 18:06), 9,7 k la final. **Blocul Mermaid e 43% la vârf și 85% la final**; agentul nu-l vede desenat, iar titlurile apar a doua oară în liste.
- [M] Construcția, înainte de hackathon (c526a027 și 85f69f31 până la 14:00): 0,84 M tokeni noi, 15 M din cache, 0,18 M scriși.
- [M] Reparațiile din prima oră și ceva (85f69f31, vin 14:48–16:00, împărțite cu comms): 152 de apeluri, 0,2 M noi, **57,8 M din cache**, 0,14 M scriși, într-o conversație cu ~380 k tokeni de context pe apel. Sunt și ~70 de minute din atenția liderului.
- [D] În echivalent preț plin (cache citit ×0,1, scris ×1,25, output ×5): D a consumat ~81 M; graful la rulare ~0,9 M (**~1%**); construcția ~3,5 M; reparațiile ~6,7 M, din care cam jumătate pentru graf.
- [M] Agentul E a rămas fără usage sâmbătă la 03:53 (`0353-A-665`), deci fiecare procent a contat.

**La ceilalți patru agenți** (măsurat de agentul fiecăruia pe 16 nov., cu același prompt; detaliile în `ANALIZA-COMMS.md`, §8)

| | D | A | B | E | C (4,5 h din 24) |
|---|---|---|---|---|---|
| Citiri ale `DAG.md` | 33 | 27 (52 k car.) | 2 (16 k) | 33 (64 k) | 11 (24 k) |
| Citiri ale `dag/tasks.yaml` | 27 | 10 (19 k) | 6 (17 k) | 16 (40 k) | 7 (14 k) |
| Caractere aduse de graf | ≤334 k | 71 k | 33 k | 104 k | 38 k |
| Parte din tokenii noi [D] | 1,5% | 1,3% | 0,4% | 1,9% | 2,0% |
| Parte din textul de coordonare (comms și graf) | ≤33% [D] | 22% | 21% | 46% | 60% |
| Etichete puse | 6 | 0 | 0 | 0 | 0 |
| Anunțuri „poate începe” primite | 10 | 1 | 3 | 2 | 0 |

- [M] **Non-liderii au citit graful, dar nu i-au scris niciodată:** 73 de citiri ale `DAG.md` și 39 ale `tasks.yaml` la patru agenți, nicio etichetă. Regulile despre etichete și despre cum deduce graful n-au fost folosite de niciunul.
- [M] **Graful a fost tras, nu împins:** cei patru au primit împreună 6 anunțuri de la bot (C niciunul) și au citit graful de 112 ori. Starea au aflat-o întrebând, nu din „poate începe”.
- [M] O citire a `DAG.md` aduce ~2 k caractere la A, E și C (citiri filtrate) și ~8 k la B (fișierul întreg). Fișierul pe om din `dag/pe-om/` are sub 1 k.
- [M] La E și la C, graful e 46% și 60% din tot textul de coordonare, mai mult decât oricare comandă `git comms` luată separat.
- [?] La A și E sesiunile au pornit din folderul părinte al repo-ului, deci nu se vede dacă regulile despre graf din `CLAUDE.local` (~2,3 k tokeni pe apel) au fost în context. La A și B, `CLAUDE.local` era dinaintea pivotului, cu taskurile vechi în „Taskurile tale”.
- [?] Din C au rămas doar 4,5 ore de transcrieri (vineri 16:13–20:47); cifrele lui sunt pentru acest interval.
- [D] **Verdict:** la rulare, graful costă de ~7 ori mai puțin decât la SmartHack. Cu tot cu construcție și reparații, hackathonul acesta a ieșit cam la egal (~8 M față de ~6,7 M); câștigul vine de acum. Pentru cei patru non-lideri, ~2,3 k tokeni pe apel n-au cumpărat nimic măsurabil.

## 8. Față de SmartHack (Cone Tuga)
- [M] Acolo erau două lucruri: `IMPLEMENTATION_PLAN.md` cu căsuțe (11,5 k caractere, 21 de commit-uri, 0 dependențe; la final 23 bifate, 32 nebifate) și un graf reîmprospătat cu AI la 15 minute: 34 de rulări, ~6,7 M tokeni (`DAG-PLAN.md`; nereverificat, transcrierile acelea nu sunt în folderul proiectului).
- [M] Planul cu bife a costat puțini tokeni (5 comenzi în sesiunile lui D îl ating), dar nu spunea starea: a fost nevoie de commit-uri „mark done what main already has”.
- [D] Graful nou a adus: stare dedusă pentru 32 de taskuri fără nicio bifă, dependențe scrise, etape urmărite până la M2. A cerut în schimb: `branch:` în plan (D5, E4, D6 au scăpat) și marcarea de mână a punctelor de control.

## Ce păstrez / ce schimb / ce scot
**Păstrez**
- Deducerea din PR-uri, `concurrency`, botul pe branch-ul lui. Punctele de control ca taskuri. Anunțul „poate începe”.
- `dag-trigger.yml` pe `comms` (0 minute; alternativa cere drept de `workflow` pe tokenul fiecărui agent).

**Schimb**
1. **Punctul de control devine o comandă cu două trepte:** `git comms checkpoint M3 probat|ok|pică "<ce>"`. „Probat” îl poate pune oricine, „ok” liderul sau cine îi ține locul (din `handoff`). Graful arată „probat de A, E; așteaptă omul”. Când Mx devine „poate începe”, botul trimite liderului un `ask`, repetat la ora-țintă. Ar fi prins M3 (8 h 45 min) și M4.
2. **Prefixul branch-ului leagă PR-ul de task:** `<id>-*` face taskul „în lucru” și apare sub el (29 de PR-uri, D6, E4); „gata” rămâne doar din `branch:` exact sau din comandă. Taskurile fără cod (D5) nu primesc `branch:`. Restul PR-urilor apar într-o listă „în afara planului”, pe om.
3. **Starea ta vine în `git comms brief`:** taskurile tale, pe cine aștepți, cine te așteaptă, sub 1 k caractere, din `state.json`. Înlocuiește citirea `DAG.md` (33 de citiri la D, 9 în 24 de minute la M2; încă 73 la ceilalți patru agenți).
4. `state.json` ține doar PR-urile din plan și se comite doar la schimbare de stare (237 de commit-uri în minus); `pull_request synchronize` sare dacă există un `push` pe același SHA (306 dubluri).
5. „Poate începe” cere și dependențele indirecte gata, ca M4 să nu apară liber înaintea lui M3.

**Scot**
- Din `CLAUDE.local` al non-liderilor: „Cum deduce graful”, „Etichetele”, rândurile aferente din „Dacă ceva nu merge” (~3,4 k caractere), înlocuite cu un rând: „lucrezi pe `<id>-…`; etapele le marchează liderul”. Detaliile rămân în `COMMS-RULES.md`.
- `[blocat]` și `[deblocat]` din reguli (0 folosiri reale); blocajele rămân fire `ask`.
- Blocul Mermaid din `DAG.md`: într-un fișier separat, pentru oameni. Copia planului („Taskurile tale”) din `CLAUDE.local`.

## Ce s-a corectat față de draft
- **Numărători duble:** transcrierile sesiunilor bifurcate conțin aceleași apeluri. Corect: 33 de citiri `DAG.md` și 27 `tasks.yaml` (nu 40 și 49), ≤334 k caractere (nu 440 k), 3073 de apeluri și 7,33 M tokeni noi (nu 3111 și 7,7 M).
- **19 din 32** de taskuri începute înainte de „poate începe” (nu 22 din 35); **10 din 16** anunțuri la D (nu 11); **475** de rulări din PR-uri (387 erau doar cele reușite).
- Cele 237 de commit-uri nu sunt „doar cursorul”: 235 scriu și cache-ul PR-urilor din afara planului. Mermaid e 43–85% din fișier, nu 43%. `DAG.md` are minimum 8,3 k caractere, nu 9,6 k.
- „13 mesaje pomenesc graful” era prea puțin: 67 pomenesc M0–M4, 12 graful sau planul.
- Starea finală: 3 taskuri greșite (D5, E4, D6); M4 „poate începe” e corect, fiindcă proba de la 10:58 a picat. M3 a întârziat din cauza regulii „omul a văzut”, nu din uitare.
- SmartHack n-a fost „fără graf”: avea unul reîmprospătat cu AI, iar acela e termenul de comparație pentru tokeni.
- Recomandarea de a scoate `dag-trigger` e retrasă (rulările sărite costă 0 minute); cea cu avertismentul la `[gata X]` pe un task cu branch e scoasă (0 cazuri).
- Adăugate: tabelul design față de realitate (§3), dovezile din sesiuni (§6), costul construcției și al reparațiilor (§7).
- Adăugat ulterior (15 nov., din raportul de facturare): minutele facturate (845, nu cele 252 reale) și dublurile pe PR-uri (§2).
- Adăugat pe 16 nov., din rapoartele agenților A, B, C și E: citirile grafului, etichetele și anunțurile primite de fiecare (§7). Înlocuiește rândul „la A, B, C, E nu se poate măsura”.
