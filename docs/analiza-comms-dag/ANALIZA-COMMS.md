# Analiza comms: v1 (Cone Tuga, 7–8 nov.) față de v2 (UiPath, 13–14 nov. 2026)

## Verdict
1. **v2 e un mecanism mai bun pe tot ce și-a propus tehnic:** un mesaj costă de ~5 ori mai puțin context, nu mai există comutări de branch, firele au stare, iar la o cerere s-a răspuns în 5 minute la mediană.
2. **Consumul total nu a scăzut.** La D, comms a adus ~29 k caractere de context pe oră, față de ~25 k în v1 (~3,1% din contextul nou față de ~3,8%). Economia pe mesaj s-a dus pe trafic de 1,8 ori mai mare, pe pornirea sesiunilor și pe `wait`.
3. **Locul scump e începutul de sesiune, nu mesajele:** hook-ul de pornire și `brief` fac ~51% din contextul comms al lui D, iar `wait` încă ~23%; mesajele noi aduse de hook-uri, calea gândită ca principală, fac ~4%.
4. **Mesajele nu s-au mutat „unde le e locul”:** 59% pomenesc un PR, 57 sunt cereri de review, 35 anunță ce e unit. Liderul e o strangulare mai mare decât în v1 (41% din mesaje îi sunt adresate, față de 30%).
5. **`wait` a scos omul din rolul de curier, dar cu un cost ascuns:** sâmbătă 03:00–09:00 agentul lui D a lucrat cu un singur prompt de la om, iar bucla a citit din cache 126 M de tokeni (20% din tot hackathonul), fiindcă fiecare trezire recitește o sesiune deja mare.

Legendă: **[M]** = măsurat (sursa în paranteză), **[D]** = dedus, **[?]** = nu se poate ști din date. Orele sunt locale.
Limite: §1–§7 folosesc transcrierile lui D (cel mai încărcat din echipă), verificate pe 15 nov. cu o a doua măsurătoare independentă (`rapoarte/ANALIZA-D.md`); §8 adaugă măsurătorile agenților A, B, C și E, făcute de ei; la C au rămas doar 4,5 ore din 24, restul transcrierilor fiind șterse. Din v1 au rămas pe disc doar ultimele 5 ore (8 nov., 10:13–15:16).
Punctele 3 și 5 din verdict arată diferit la A, B, C și E: puține porniri de sesiune, dar sesiuni uriașe, recitite la fiecare apel (§8).
Tokenii din caractere sunt estimați la ~3 caractere pe token [D].

## 1. Traficul
| | v1 | v2 |
|---|---|---|
| Mesaje scrise de agenți | 354 în 22,3 h | 627 în 22,2 h (+16 de la botul `dag`) |
| Lungime: medie / mediană / maxim | 500 / 427 / 2737 | 181 / 208 / 300 |
| Peste 300 de caractere | 261 (74%) | 0 |
| Volum total | 177 k caractere | 114 k caractere |
| Commit-uri de mesaje pe `main` | 199 din 471 (42%) | 0 (774 pe branch-ul `comms`) |
| Rulări de GitHub Actions pornite de mesaje | 201 (CI întreg: Linux, Windows, gitleaks) | 742, din care 736 sărite |
| Minute de Actions facturate din cauza mesajelor | ~790 (~$6,3) [D] | 6 ($0,04) |
| Cât din trafic vede un agent | 100% | A 29%, B 15%, C 26%, E 35%, D 43% |
| D ca destinatar / ca expeditor | 30% / 27% | 41% / 35% |

- [M] Sursa v1: cele cinci `COMMS.md` de pe `origin/main` din `cone-tuga-smarthack-2026`. Sursa v2: `msgs/` de pe `origin/comms`.
- [M] **În v1, fiecare mesaj era un commit pe `main` și pornea tot CI-ul.** 201 din cele 565 de rulări ale `tests.yml` au titlul `comms:` (`gh api …/actions/runs`), adică 35% din rulări și din durată.
  `tests.yml` a facturat 2229 de minute ($17,76; raportul de facturare GitHub pe noiembrie), deci mesajele au costat ~790 de minute [D: proporțional]. Repo-urile erau private atunci.
  În v2, mesajele stau pe branch-ul `comms`, exclus din `dag.yml`; `dag-trigger.yml` a facturat 6 minute.
- [M] Tipuri în v2: `answer` 205, `ask` 180, `fyi` 138, `close` 55, `review` 32, `contract` 17. **`approve` și `reject`: 0. `cc`, `needs`, `due`: 0.** `--saved-to`: 4. `--human-ok`: 4.
- [M] 183 de mesaje (29%) au mai mulți destinatari; 18 sunt pentru `all`.
- [M] **95 de mesaje (15%) vin la cel mult 2 minute după altul de la același om către aceiași destinatari:** limita de 300 e ocolită prin rupere în bucăți.

## 2. Firele și răspunsurile (doar v2; v1 nu avea fire)
- [M] 324 de fire: 130 pornite cu `fyi`, 190 cu o cerere (`ask`, `review`, `contract`). **La final au rămas deschise 11.**
- [M] Din cele 190 de cereri, 164 au primit răspuns de la altcineva: **mediana 5 minute**, 87 în cel mult 5 minute, 31 după peste o oră.
  Pe cel care răspunde: A 2 min, B 4, C 4, **D 13 (p90 ~5 h)**, E 19.
  Pe toate cele 107 cereri către D, nu doar pe primul mesaj din fir (`rapoarte/ANALIZA-D.md`): mediana 16 min, p90 ~6,5 h; 36 în cel mult 5 minute, 35 după peste o oră.
- [M] **124 din cele 190 de cereri (65%) sunt despre un review sau un PR**, cele mai multe scrise ca `ask`, nu ca `review`.
- [M] 26 de cereri n-au primit niciun răspuns în comms (14 către E), dar **22 dintre ele cer review sau pomenesc un PR**, deci verdictul s-a dat pe GitHub.
  Cu adevărat fără răspuns au rămas 4 (de exemplu predarea E→A de la 03:53 și `0840-B-e7s`, despre M3). Firul lor rămâne însă „deschis” și se reafișează (§3).
- [M] În 34 de fire (10%) discuția a continuat după un mesaj care închidea firul. Dubiul din `PREDARE.md` („`answer` închide firul”) s-a confirmat, dar la scară mică.
- [M] Din 55 de `close`, doar 24 sunt date de autorul firului; restul de 31 sunt curățenie făcută de altcineva.
- [M] Unealta n-a pierdut și n-a stricat nimic vizibil la D: nicio eroare a ei în comenzile de scriere, doar 4 refuzuri corecte (2 pentru lungime, 2 fiindcă lucrul era predat; `rapoarte/ANALIZA-D.md`). Pentru A, vezi §8.

## 3. Costul în context la D (78 de sesiuni, 3073 de apeluri, 7,3 M tokeni noi, 630 M citiți din cache)
| Ce a intrat în context | Caractere | Parte |
|---|---|---|
| Hook-ul de pornire: fire deschise reafișate cu tot textul (79 de porniri) | 188 k | 27% |
| `git comms brief` (34 de apeluri, mediana 4,3 k) | ~140–186 k | ~24% |
| `wait`: 123 de porniri, 124 de notificări, 120 de citiri ale ieșirii | ~160 k | 23% |
| `show` (41) + `log` (5) + citiri de mână din `origin/comms` și `.comms/` (16) | 107 k | 16% |
| Scrierea: `send`, `reply`, `close`, `state` (212 apeluri) | 37 k | 5% |
| Mesaje noi prin cele trei hook-uri (122 de rânduri) | 30 k | 4% |
| **Total** | **~685 k ≈ 230 k tokeni** | **~3,1% din contextul nou** |

- [M] Sursa: transcrierile din `~/.claude/projects/…UiShapeshifter`, doar fereastra hackathonului, cu duplicatele din sesiunile bifurcate scoase. 8 apeluri `brief` sunt înlănțuite cu `DAG.md`, de aici intervalul.
  Totalurile din titlu sunt aceleași ca în `ANALIZA-DAG.md` (fără sub-agenți; cu ei sunt ~3100 de apeluri și 7,6 M tokeni noi).
- [M] Tabelul e corectat după `rapoarte/ANALIZA-D.md`. Prima variantă număra de două ori hook-urile `PostToolUse` (fiecare lasă două rânduri în transcriere: 31 reale, nu 62) și nu număra citirile ieșirii lui `wait` (120 de citiri, 64 k caractere) și 52 dintre notificări.
  A doua măsurătoare dă pentru comms 627 k caractere (2,85%), fără notificări; diferența față de tabel e sub 10%.
- [M] D a rulat mai ales pe Opus 5.5 (2385 din 3064 de apeluri), apoi pe Fable 5.2 (368) și Sonnet 5.5 (296).
- [M] **Calea ieftină a ieșit cum a fost gândită.** Hook-ul de la prompt a afișat ceva la 33 de prompturi din ~360 și zero caractere la restul; trimiterea unui mesaj întoarce 45 de caractere la mediană.
- [M] **Pornirea sesiunii e scumpă din cauza firelor de review.** Cele 724 de rânduri „deschis” acoperă doar 52 de fire; cele mai vechi au fost reafișate de 25 de ori.
  454 de rânduri (63%) sunt cereri de `review`: verdictul s-a dat pe PR, cum cere regula, deci nimeni n-a mai închis firul din comms.
- [M] `brief` repetă ce arată deja hook-ul de pornire (stare, mesaje noi, fire deschise). Regulile îl cer doar „dacă nu apar rândurile”, dar a fost rulat de 34 de ori la 79 de porniri.
- [M] Regulile încărcate în fiecare apel: v1 avea 1,9 k caractere în `CLAUDE.md`. v2 are 2,3 k în `CLAUDE.md`, 1,1 k („Comms pe scurt”, repetat în `CLAUDE.local.md`) și ~0,4 k de interdicții: ~3,8 k, **de două ori mai mult**.
  Citite din cache la 3073 de apeluri fac ~4 M tokeni, sub 1% din total.

## 4. Față de v1, pe aceeași unitate
- [M] v1, ultimele 5 ore: 555 de apeluri, 66 de prompturi, **25 de citiri de `COMMS.md` cu 123 k caractere (4,9 k pe citire)** și 6 trimiteri. Asta face ~3,8% din contextul nou și ~25 k caractere pe oră.
- [M] v2: ~685 k caractere în 24 de ore, adică ~29 k pe oră.
- [D] Pe mesaj: în v1, 123 k caractere pentru 19 mesaje apărute în fereastră (~6,5 k pe mesaj, cazul cel mai rău, cu fișierele la mărimea maximă).
  În v2, 685 k pentru 496 de mesaje primite sau trimise de D (~1,4 k pe mesaj). **De ~5 ori mai ieftin pe mesaj, ceva mai scump pe oră.**
- [D] Proba de laborator din `PREDARE.md` promitea de 8 ori mai puțin pe același trafic. Diferența vine din ce nu era în probă: 79 de porniri de sesiune, `brief`, `show`, și trafic aproape dublu.
- [M] Trimiterea: în v1 era switch pe `main`, pull, commit, push, switch înapoi; în v2 e o comandă. Aici v2 a rezolvat complet problema.
- [?] Consumul celorlalți patru și consumul v1 din ziua întâi nu se pot măsura.

## 5. Ce a rezolvat v2 din problemele v1 (tabelul din `IMBUNATATIRI-V2.md`)
| Problema din v1 | Rezultat | Dovada |
|---|---|---|
| Fiecare agent citea toate inbox-urile | **Rezolvat pe mesaj, nu pe total** | §3, §4 |
| Mesaje lungi (~500) | **Rezolvat**, cu 15% ocoliri | 0 peste 300; 95 rupte în bucăți |
| Nicio stare, niciun fir | **Rezolvat** | 324 de fire, 11 deschise la final |
| Comutări de branch la fiecare mesaj | **Rezolvat complet** | 0 commit-uri de mesaje pe `main` (42% în v1); dispar și ~790 de minute de CI |
| Liderul ca strangulare | **Mai rău** | D: 41% din mesaje, mediana lui 13 min, p90 ~5 h; auto-merge neconstruit |
| Oamenii transmiteau între agenți | **Parțial** | §6 |
| Istoricul conversației crește | **Nerezolvat** | 78 de sesiuni la D, fiecare pornire ~4–5 k caractere de comms |
| Mai puține mesaje (mutate pe PR, în `specs/`, în scripturi) | **Nu s-a întâmplat** | 369 pomenesc un PR; 57 cereri de review; 35 `fyi` „e unit / e pe main”; 4 `--saved-to` la 17 contracte |

- [D] Dubiul din predare era „câștigul mare nu vine din unealtă, ci din reguli”. S-a întâmplat invers: ce impune unealta (limita, destinatarul, firul) a ținut; ce cereau doar regulile (review pe PR, fără anunțuri de unire) nu.

## 6. `wait`, predarea și starea
- [M] `wait` a fost pornit de 123 de ori, mereu în fundal, în 11 sesiuni; 120 s-au încheiat cu un mesaj și 4 au fost oprite (`rapoarte/ANALIZA-D.md`).
- [M] **Sesiunile paralele ale aceluiași agent se trezesc toate la același mesaj.** Sâmbătă la 00:56, două sesiuni ale lui D au fost trezite în același minut, apoi au ținut câte un `wait` peste 90 de minute; la 11:19 erau 4 `wait`-uri pornite deodată.
- [M] Livrarea în mijlocul lucrului merge: din 31 de hook-uri `PostToolUse` cu mesaj nou, 22 au fost urmate de un răspuns în cel mult 10 minute, în aceeași sesiune.
- [M] **Sâmbătă 03:00–08:59: un singur prompt de la om, 423 de apeluri, 51 de mesaje trimise de D, 126 M tokeni citiți din cache** (20% din fereastra hackathonului).
  Între 06:00 și 09:00, un apel citea 340–460 k tokeni: sesiunea era deja mare, iar fiecare trezire o recitește.
- [M] Ziua, omul a rămas parțial curier: ~10 prompturi de tipul „verifică mesaje” sau „răspunde la mesaje” (lista din transcrieri).
- [M] `state` a fost folosit cu adevărat: 118 commit-uri (D 40, C 39, A 18, B 12, E 9). Predarea: 3 `handoff` (D→E, B→C, E→A) și 3 `back`.
  D a atins limita de 5 ore de patru ori (vineri 16:42, 19:37, 23:29 și sâmbătă 00:57); predarea către E s-a făcut cu 6 minute înainte de prima. E a rămas fără usage sâmbătă la 03:53 și a revenit la 04:59. [?] Cât a ajutat nota de predare pe cel care a preluat nu se vede din datele lui D.
- [M] Unealta a fost reparată de trei ori în primele două ore (`4a3250b` rețea și lock, `3d590ac` `send --each`, `89bb5e2` blocul din `CLAUDE.md`).
  Reparațiile la comms și la graf au citit împreună 57,8 M tokeni din cache, într-o singură sesiune de ~380 k tokeni pe apel (`ANALIZA-DAG.md`, §7).
- [M] În v1, „E for D” apare în 21 de mesaje. În v2, semnătura automată apare o dată, iar „Ca D, la cererea lui…” scris în text, de două ori.
  [D] Ținutul locului s-a mutat din mesaje în sesiunea liderului (promptul „D for C” de sâmbătă 12:07).

## 7. Legătura cu graful
- [M] Prin comms au trecut 6 mesaje cu etichete (toate de la D) și 16 anunțuri de la `dag`, care au ajuns la agentul lui D în 1–4 minute. Detaliile sunt în `ANALIZA-DAG.md`.
- [M] Echipa a vorbit despre etape în cuvinte, nu în etichete: 67 de mesaje pomenesc M0–M4, față de 4 etichete reale. M3 a stat 8 h 45 min nemarcat deși A și E îl probaseră, fiindcă regula cerea ca omul lui D să-l vadă.
- [D] Cele două sisteme au aceeași problemă la începutul sesiunii: hook-ul de pornire (în medie 2,5 k caractere), `brief` (4,3 k) și `git show origin/dag:DAG.md` (10–20 k) arată lucruri care se suprapun.
- [D] Botul din Actions știe deja când un PR e deschis, aprobat sau unit. Cererile de review și anunțurile de unire, adică traficul care n-a plecat din comms, sunt exact ce poate scrie el.

## 8. Ceilalți patru agenți: A (Mihnea), B (Ștefan R.), C (Adelin) și E (Iulia)
Cifrele sunt măsurate de agentul fiecăruia pe transcrierile lui (`rapoarte/ANALIZA-A.md`, `rapoarte/ANALIZA-B.md`, `rapoarte/ANALIZA-C.md`, `rapoarte/ANALIZA-E.md`), cu același prompt. Am verificat pe `origin/comms` ce ține de mesaje (A: 144 trimise, 173 primite; B: 56 trimise, 94 primite; E: 95 trimise, 221–222 primite, 65 de cereri către E; C: 112 trimise, 164 primite, 42 de cereri către C; toate cu aceleași tipuri) și am comparat fișierele lor `CLAUDE.local.md` cu versiunile din repo.

| | D | A | B | E | C (4,5 h din 24) |
|---|---|---|---|---|---|
| Sesiuni în fereastră | 78 | 1 | 2 | 1 | 3 rămase |
| Apeluri la model | 3073 | 1390 | 794 | 1419 | 405 |
| Tokeni noi / citiți din cache | 7,3 M / 630 M | 1,8 M / 706 M | 2,7 M / 330 M | 1,8 M / 699 M | 0,6 M / 145 M |
| Citit din cache pe apel, în medie (maxim) | ~205 k (627 k) | **~508 k** (966 k) | **~415 k** (748 k) | **~493 k** (966 k) | ~357 k (667 k) |
| Sesiuni pornite din afara repo-ului, fără hook-uri | 0 | 1 din 1 | 1 din 2 (6,5 h) | 1 din 1 | 0 |
| Hook-uri cu `[comms]` | 143 | **0** | 17 | **0** | 5 |
| `wait` pornit | 123 | 146 | 29 | 18 | 16 |
| `brief` rulat | 34 | 3 | 45 | 5 (și `inbox` de mână: 73) | 4 |
| Trimiteri refuzate | 4 | 7 | 2 | 13 | 0 |
| Prompturi de tipul „verifică mesajele” | ~10 din ~360 | 15 din 67 | 11 din 63 | 16 din 214 | 3 din 44 |
| `close` trimise | 50 | 0 | 3 | 2 | 0 |
| Cereri de `review` trimise | 4 | 26 | 0 | 0 (32 de `ask` despre PR-uri) | 2 (31 de cereri despre PR-uri) |
| Etichete pentru graf / citiri `DAG.md` | 6 / 33 | 0 / 27 | 0 / 2 | 0 / 33 (plus 16 ale `tasks.yaml`) | 0 / 11 (plus 7 ale `tasks.yaml`) |
| `CLAUDE.local.md` față de repo | ultima versiune (17:36) | prima (14:41) | a treia (15:50), plus o regulă proprie | ultima versiune (17:36) | ultima versiune (17:36) |
| Comms și graf din tokenii noi | ~4% | ~5,9% | ~1,9% | ~4,2% | ~3,4% |
| Limita de usage atinsă | de 4 ori | o dată | de 2 ori | de 2 ori | 0 în ce a rămas [?] |

### A
- [M] **La A, hook-urile n-au rulat deloc.** Agentul a pornit din folderul părinte al repo-ului, iar toate cele 289 de comenzi `git comms` sunt înlănțuite cu `cd … &&`.
  Confirmat în a doua rundă a raportului: în folderul de pornire nu există `.claude/settings.json`, iar cel din repo, cu cele trei hook-uri, nu a fost încărcat.
- [M] **`CLAUDE.local.md` al lui A a rămas la prima versiune** (identic cu `docs/agenti/CLAUDE.local-A.md` din `ace6820`, vineri 14:41), cu trei versiuni în urmă.
  Îi lipsesc reparațiile la etichete (`ce58deb`), `send --each` (`3d590ac`) și tot pivotul cu etapele (`b6a1603`, 17:36): descrie produsul vechi (aplicație de mesaje pentru vârstnici) și 4 taskuri vechi, în loc de cele 6 din planul final (A2–A4 redefinite, A5 și A6 lipsă), fără puncte de control.
  [?] Cât din el a fost în context, cu sesiunea pornită din folderul părinte, nu se vede.
- [M] Fără hook-uri, mesajele au venit doar prin `wait`: un mesaj primit a costat ~1,1 k caractere, de ~4 ori mai mult decât prin hook la D (~250 de caractere), iar omul a cerut de 15 ori verificarea mesajelor.
- [M] **O singură sesiune de 24 de ore a citit din cache mai mult decât cele 78 ale lui D, cu mai puțin de jumătate din apeluri.** E același efect ca la bucla de noapte a lui D (§6), întins pe tot hackathonul.
- [M] **Cursorul comun strică livrarea:** `inbox` rulat de mână lângă un `wait` pornit a făcut ca un mesaj al lui D să fie ratat (vineri 14:56–15:15), iar 7 `wait`-uri duble au fost oprite de agent (exit 143, nu eșecuri ale uneltei). Din 3 rulări de mână ale lui `inbox`, 2 au fost cu un `wait` pornit.
- [M] A a avut 7 trimiteri refuzate din 154 (4,5%): 6 pentru lungime și una de frâna la bucle (trecută cu `--human-ok`, `0718-A-xhz`). La D au fost 4, niciunul de frână.
- [M] Din cele 57 de cereri către A, 17–19 n-au răspuns de la A în fir. Pe `origin/comms`: la 9 a răspuns alt destinatar, 5 le-a închis chiar expeditorul și 3 au rămas fără nimic după ele (una e predarea E→A, pe care A a preluat-o).
- [M] A n-a predat niciodată lucrul și a avut apeluri în 23 din cele 24 de ore.
- [M] **A a deschis fire și D le-a închis:** A a trimis 26 din cele 32 de mesaje `review` și niciun `close`; D a trimis 50 din cele 55 de `close`. Firele reafișate cel mai des la pornirile lui D (§3) sunt review-urile lui A.
- [M] La A, comms și graful fac ~5,9% din tokenii noi (318 k caractere), față de ~4% la D; procentul e mai mare fiindcă o singură sesiune are puțini tokeni noi.
### B
- [M] **B a lucrat și el după instrucțiuni dinaintea pivotului.** `CLAUDE.local.md` al lui e versiunea din `3d590ac` (vineri 15:50) plus o secțiune proprie: descrie produsul vechi și taskurile vechi B1–B4. Din trei agenți măsurați, doar D a avut versiunea de după pivot.
- [M] **Regula proprie a lui B a înlocuit hook-ul cu `brief`.** Secțiunea „Reguli de la Ștefan” cere, la fiecare prompt, `git fetch` și citirea mesajelor „sau `git comms brief`”. Rezultatul: 45 de apeluri `brief` la 63 de prompturi (46 k caractere), față de 7 k caractere aduse de hook-uri.
- [M] **Jumătate din hackathon fără hook-uri.** Prima sesiune a lui B (6,5 ore) a pornit din folderul părinte, ca la A: 0 rânduri `[comms]` și 53 de comenzi rulate de mână. În a doua sesiune, pornită din repo, hook-urile au mers.
- [M] Toate cele 130 de comenzi `git comms` sunt înlănțuite, 127 cu `cd`, inclusiv în sesiunea pornită din repo, deși regula spune „fără `cd`”.
- [M] **Predarea a mers la minut, dar numai când a făcut-o omul.** `handoff` către C la 16:53, cu un minut înainte de limită; `back` la 19:54. La a doua limită (21:06) n-a mai fost nicio predare, iar B a lipsit până la 00:52.
  În acest interval și imediat după, C i-a scris de trei ori că îi preia taskurile (`2335-C-k65`, `0209-C-qa7`, `0318-C-tn3`); niciunul n-a primit răspuns.
- [M] Din cele 8 cereri către B fără răspuns de la el: la 4 a răspuns alt destinatar, una a fost închisă de D și 3 sunt cele de mai sus. B a răspuns la 20 din 28, cu mediana 5,3 min și p90 105 min.
- [M] B a folosit puțin graful: 2 citiri ale `DAG.md`, nicio etichetă. Singurul mesaj semnat automat „for” din tot hackathonul e al lui C pentru B (`1657-C-vga`).
- [M] Cele 2 refuzuri ale lui B au un motiv în afara celor patru categorii. [D] Cel mai probabil e refuzul „i-ai predat lucrul lui C, rulează întâi `git comms back`” (`comms.py`, `post`), fiindcă B a predat între 16:53 și 19:54.
### E
- [M] **Și la E hook-urile n-au rulat deloc.** Singura sesiune a lui E, de 24 de ore, a pornit din folderul părinte al repo-ului, unde nu există `.claude/settings.json`. Mesajele au venit prin `inbox` rulat de mână: 73 de apeluri, 74 k caractere (~1 k pe apel, fiindcă `inbox` fără `--new` reafișează firele deschise cu tot textul).
- [M] **Fără hook-uri și cu puține `wait`-uri (18), E a răspuns mai încet:** mediana 18 min până la răspuns, față de 2–4 min la A, C și B. La cererile lui E, ceilalți au răspuns cu mediana de 3 min (42 din 44).
- [M] **E are instrucțiunile la zi** (`CLAUDE.local.md` identic cu `b6a1603`, 17:36), singurul agent în afară de D. [?] Cât din ele a fost în context, cu sesiunea pornită din folderul părinte, nu se vede.
- [M] **E a citit graful cel mai mult:** 33 de citiri ale `DAG.md` (64 k caractere) și 16 ale `dag/tasks.yaml` (40 k). Împreună fac 46% din textul lui E de comms și graf (104 k din 227 k), fără nicio etichetă pusă.
- [M] **Cele mai multe refuzuri din echipă:** 13 la ~108 încercări (12%), dintre care 12 pentru lungime și unul de frâna la bucle. Mesajele lui E au în medie 205 caractere, față de 181 pe echipă.
- [M] Din cele 65 de cereri către E, 36–39 n-au răspuns de la E în fir (după cum numeri răspunsul: direct sau oriunde în fir). 23–24 pomenesc un PR sau cer review, la 20 a răspuns alt destinatar, iar 3 au rămas deschise la final (`0209-C-52s`, `0847-A-9mn`, `1014-C-2cf`).
- [M] **Predarea E→A a mers** (03:53–04:59, la a doua limită de usage): A i-a unit PR-urile deschise, iar la întoarcere `back` și `brief` au fost de ajuns. A a scris în numele lui, nu „for E”: niciun mesaj semnat pentru E.
  [M] `handoff` a comis pe branch-ul de predare un fișier rămas din greșeală, scos apoi cu un commit în plus: comanda face `git add -A` pe tot ce nu e secret și nu arată ce a comis.
- [M] Maximul citit din cache într-un apel e același la A și E (966 k). [D] E plafonul ferestrei de context: ambele sesiuni au ajuns la limită și au fost compactate.

### C
- [M] **Din ziua lui C au rămas 4,5 ore de transcrieri** (vineri 16:13–20:47): două sesiuni au fost șterse din aplicație pe 16 nov. Jurnalele arată 7 porniri în fereastră, iar C a trimis mesaje în 21 din cele 24 de ore. Consumul, hook-urile și refuzurile de mai sus sunt doar pentru acest interval; cifrele despre mesaje acoperă toată fereastra.
- [M] **La C instalarea a ținut:** sesiunile au pornit din rădăcina repo-ului, hook-urile au rulat, iar `CLAUDE.local.md` e ultima versiune (`b6a1603`).
- [M] **C a răspuns cel mai repede:** la 31 din 42 de cereri, cu mediana de 3 min și p90 de 29 min. Din cele 11 fără răspuns de la C, 9 sunt despre PR-uri, la 10 a răspuns alt destinatar și una a rămas deschisă (`0252-B-yar`).
- [M] **Graful face 60% din textul de coordonare al lui C:** 11 citiri ale `DAG.md` și 7 ale `tasks.yaml`, 38 k din 64 k caractere, în 4,5 ore. Nicio etichetă în cele 112 mesaje.
- [M] **Ieșirea lui `wait` a fost citită de 26 de ori** (19 k caractere) la 16 porniri, ca la D (§3): notificarea de încheiere nu aduce mesajul, deci agentul mai face o citire. Au fost și două `wait`-uri pornite deodată, ca la A.
- [M] C a trimis 112 mesaje, al treilea ca volum, după D și A, dintre care 35 `fyi`. Din cele 43 de cereri ale lui, 31 sunt despre PR-uri și 24 merg la D.
- [M] C a ținut locul lui B între 16:53 și 19:54 și a trimis singurul mesaj semnat „for” (`1657-C-vga`). Noaptea a preluat taskurile lui B fără predare, anunțând în trei mesaje rămase fără răspuns (§8, B).
- [M] O singură sesiune (402 apeluri în 4,5 ore) a ajuns la 667 k tokeni citiți din cache pe apel: același tipar de sesiune lungă ca la A, B și E.
### Concluzii din cei cinci
- [D] **Costul mare nu e textul mesajelor (1,9–5,9% din tokenii noi), ci contextul recitit la fiecare apel.** A, B, C și E au citit din cache 357–508 k tokeni pe apel, de 1,7–2,5 ori cât D, fiindcă au ținut sesiuni lungi. D l-a plătit noaptea, ceilalți tot timpul. A și E, cu câte o singură sesiune de 24 de ore, au citit fiecare ~700 M, mai mult decât D în 78 de sesiuni.
- [M] **Instalarea n-a ținut la 3 din 5 agenți:** sesiuni pornite din afara repo-ului (A și E tot timpul, B 6,5 ore) și instrucțiuni locale rămase înaintea pivotului (A și B). Hook-urile au rulat tot timpul doar la D și, în intervalul rămas, la C.
- [M] **Viteza de răspuns ține de `wait`, nu de hook-uri.** Mediana până la răspuns, cu aceeași metodă pentru toți, pe `origin/comms`: A 2 min (p90 7), C 3 (p90 29), B 4 (p90 120), D 13 (p90 ~6 h), E 18 (p90 54). A n-a avut niciun hook, dar a ținut un `wait` pornit tot timpul (146); E n-a avut nici hook-uri, nici `wait` continuu (18). D e lent din alt motiv: 107 cereri către el, cât A și C la un loc.
- [M] **Omul a rămas curier acolo unde hook-urile n-au mers:** 15 din 67 de prompturi la A, 11 din 63 la B și 16 din 214 la E cer verificarea mesajelor, față de ~10 din ~360 la D și 3 din 44 la C. La E procentul e aproape cât la C (7%), fiindcă agentul a rulat singur `inbox`.
- [M] **Fără hook-uri, agentul plătește altă cale, mai scumpă:** A prin `wait` (146), B prin `brief` (45), E prin `inbox` de mână (73). Toate trei reafișează firele deschise cu textul întreg.
- [M] **Graful se citește întreg ca să afli ce e al tău:** 33 de citiri ale `DAG.md` la D și la E, 27 la A. Graful e 46% din textul de coordonare la E și 60% la C, iar nimeni în afară de D n-a pus vreo etichetă.
- [M] **Măsurătoarea ține de transcrieri care se pot șterge:** la C s-au pierdut 19,5 ore din 24 în două zile. Uneltele nu țin nicio evidență proprie a ce au tipărit.
- [M] **Predarea fără tokeni funcționează, dar depinde de om:** D și B au predat cu 6 minute, respectiv un minut înainte de limită, iar E la a doua limită; când limita a venit fără predare, mesajele către cel plecat au rămas fără răspuns.

## Ce aș păstra / ce aș schimba / ce aș scoate
**Păstrez**
- Un fișier pe mesaj, pe branch-ul `comms`, în worktree; hook-ul care tace când nu e nimic nou; limita de 300; `re` și starea dedusă.
- `wait`, `state`, `handoff` și frâna la bucle. Toate au fost folosite și au mers.

**Schimb, în ordinea economiei**
1. **Hook-ul de pornire arată firele deschise pe un singur rând** (număr și id-uri), nu cu textul. Ar fi tăiat ~180 k din ~685 k caractere (26%).
   `brief` nu mai repetă ce a arătat hook-ul și primește rândurile tale din graf; împreună, pornirea scade la sub 1 k caractere.
2. **Un fir de `review` se închide singur când PR-ul e aprobat sau unit** (botul vede asta), iar cererea de review o scrie botul la deschiderea PR-ului. Dispar 63% din reafișări, cele 57 de cereri și cele 35 de anunțuri.
3. **Bucla de noapte rulează într-o sesiune scurtă:** `wait` trezește o sesiune proaspătă care citește `brief`, răspunde și se închide, în loc să recitească o sesiune de 400 k tokeni la fiecare mesaj. Aici e cel mai mare câștig de usage (126 M tokeni din cache într-o noapte).
4. **Auto-merge pe reguli** (faza 3, neconstruită): PR care atinge doar fișierele autorului și are CI verde. E singura piesă care scade coada de la D (41% din mesaje, p90 ~5 h).
5. **`git comms checkpoint Mx probat|ok|pică`** (propunerea din `ANALIZA-DAG.md`): „probat” îl pune oricine, „ok” liderul sau înlocuitorul lui, iar botul îi cere liderului punctul de control printr-un `ask`. Înlocuiește etichetele scrise de mână.
6. Al doilea mesaj către aceiași destinatari în 2 minute se lipește de primul ca același fir, ca ruperea în bucăți să nu deschidă fire noi.

**Scot**
- `cc`, `needs`, `due`, `approve`, `reject`: zero folosiri. Etichetele `[blocat]` și `[deblocat]`: zero folosiri reale.
- „Comms pe scurt” din fiecare `CLAUDE.local.md` (1,1 k): repetă blocul din `CLAUDE.md`.
- Regulile „review pe PR” și „nu anunța ce e pe `main`” ca text: se înlocuiesc cu botul de la punctul 2, fiindcă textul n-a fost respectat.
