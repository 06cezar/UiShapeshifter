# Brief de implementare: comms v3 și graful, după hackathonul UiPath

Pentru sesiunea (sau omul) care construiește versiunea următoare. Motivele și cifrele sunt în `ANALIZA-COMMS.md` și `ANALIZA-DAG.md`; aici e doar ce se face, unde și cum știm că e gata.

## Scopul, într-o frază
Aceeași coordonare ca la UiPath, cu **pornirea unei sesiuni sub 2 k caractere** (acum 7–25 k cu graful), **fără mesaje de rutină scrise de agenți** și **fără sesiuni de 400 k tokeni trezite la fiecare mesaj**.

## De unde pornești
- **Codul e identic în folderele uneltelor și în `UiShapeshifter`** (verificat pe 15 nov., fără terminațiile de rând): `comms.py`, `install.py`, `build_dag.py`, `notify_ready.py`, `dag.yml`.
  Diferă doar `claude-block.md` (un rând în plus în `UiShapeshifter`), `tasks.yaml` și instrucțiunile agenților, care țin de proiect.
- Comms: versiunea finală e comisă și în `claudes-communication-network-and-protocol` (commit `f9cb058`, 15 nov., pe `master`; repo-ul nu are remote).
- Graful: `tasks-depend-DAG` nu e repo git pe calculatorul lui Cezar, deci versiunea de la hackathon are istoric doar în `UiShapeshifter`.
- **Din 15 nov. după-amiază, `tasks-depend-DAG` e înaintea lui `UiShapeshifter`** (vezi `SCHIMBARI-DAG.md`): PR-urile se leagă și după prefixul branch-ului, botul scrie `dag/pe-om/<om>.md`, anunțul trimite la acel fișier, iar `synchronize` e scos din `dag.yml`. Are 95 de teste locale; pe GitHub Actions nu a rulat încă.
- Costul în bani: `dag.yml` a facturat 845 de minute ($5,07) pe un repo privat, câte un minut pe rulare; mesajele comms, 6 minute.
- Testele sunt doar în folderele uneltelor și trec azi: `tests/test_comms.py` (22) și `tasks-depend-DAG/dag/tests/` (78).
- Date reale pentru probă: branch-urile `origin/comms` (643 de mesaje) și `origin/dag` (330 de commit-uri) din `UiShapeshifter`, plus `gh pr list --state all` (166 de PR-uri).

## Decizii pe care le ia Cezar înainte de start
1. **Unde trăiește v3.** Recomandarea mea: un singur repo, `claudes-communication-network-and-protocol`, cu `dag/` mutat în el; cele două unelte se instalează și se testează împreună.
2. **Bucla de noapte** (etapa 4): în ce mod de permisiuni are voie o sesiune pornită fără om.
3. **Auto-merge** (etapa 5): ce verificări trebuie să fie verzi. La UiPath, `dag` era singura verificare de pe PR-uri, deci întâi trebuie un CI cu `npm run check` și `npm test`.

## Etapa 0: surse la zi și date de probă
- Pune codul grafului sub git (în repo-ul de comms, după decizia 1); testele existente trebuie să treacă în continuare.
- Salvează ca fixture: arhiva `msgs/` de pe `origin/comms`, lista PR-urilor ca JSON și `dag/tasks.yaml` final.
- Scrie un script de măsurat (`tests/replay.py`): pentru agentul D, la un moment dat din istoricul `comms`, câte caractere tipăresc `git comms inbox` și `git comms brief`.
  Referința de azi: `inbox` la pornire are mediana 629, media ~2,5 k și maximul 8,8 k; `brief` are mediana 4,3 k.
- `comms.py` își ține singur evidența: la fiecare rulare adaugă un rând în `.git/comms/usage.log` (ora, subcomanda, de unde a fost chemată: hook sau de mână, câte caractere a tipărit). `git comms usage` le adună pe subcomandă.
  La hackathon, măsurătoarea a cerut un script pe transcrieri la fiecare agent, iar la C transcrierile a 19,5 ore din 24 au fost șterse înainte de măsurat.

## Etapa 1: pornirea sesiunii (cel mai mare câștig, cea mai mică schimbare)
| Ce | Unde | Cum |
|---|---|---|
| Firele deschise pe un singur rând | `cmd_inbox`, ramura fără `--new` | în loc de `lines.append(last.line("deschis"))`, strânge id-urile și tipărește `[comms] N fire deschise pentru tine: id, id… (git comms show <id>)`, ca la „aștepți răspuns” |
| `brief` scurt | `cmd_brief`, `work_note` | `brief` tipărește starea salvată, branch-ul, mesajele noi și id-urile firelor deschise; `git status`, ultimele 8 commit-uri și `diff --stat` rămân doar în nota de `handoff` |
| Rândurile tale din graf în `brief` | `cmd_brief` | tipărește `origin/dag:dag/pe-om/<nume>.md` (fișierul există deja în `tasks-depend-DAG`, sub 1 k caractere; fetch o dată pe minut, ca la `comms`); dacă lipsește, nu tipărește nimic |
| Mermaid în alt fișier | `render_markdown`, `render_mermaid` | `DAG.md` rămâne cu listele; diagrama merge în `DAG-GRAF.md`, pentru oameni |
| Reguli scurtate | `tools/comms/claude-block.md`, șablonul `CLAUDE.local` | iese „Comms pe scurt” (repetă blocul din `CLAUDE.md`); pentru non-lideri ies „Cum deduce graful” și „Etichetele”, înlocuite cu un rând; regula „la începutul sesiunii citește `DAG.md`” devine „rulează `git comms brief`” |

Tot aici, reparațiile care au ieșit din măsurătorile agenților A, B, C și E (`ANALIZA-COMMS.md`, §8):
- **Instalarea verifică dacă hook-urile chiar rulează.** La A și la E n-a rulat niciunul, iar la B au lipsit 6,5 ore, fiindcă sesiunile au pornit din folderul părinte (3 din 5 agenți). `comms.py` ține deja marcajul `last-hook`; `send` și `wait` avertizează o dată dacă marcajul lipsește sau e mai vechi de o oră, cu textul „pornește sesiunea din rădăcina repo-ului”.
- **Instrucțiunile locale nu mai pot rămâne în urmă.** `CLAUDE.local.md` al lui B a rămas la versiunea de vineri 15:50, dinaintea pivotului, cu produsul și taskurile vechi; A a avut prima versiune până vineri la 18:10, când agentul lui l-a adus singur la zi. Copia planului („Taskurile tale”) și descrierea proiectului ies din `CLAUDE.local`: taskurile vin din `dag/pe-om/<nume>.md`, proiectul din `CLAUDE.md`. Pentru ce rămâne, `brief` avertizează dacă fișierul local diferă de `docs/agenti/CLAUDE.local-<nume>.md` de pe `origin/main`.
- **Un mesaj către cineva plecat spune asta pe loc.** B a atins limita la 21:06 fără `handoff`, iar trei cereri ale lui C către el au rămas fără răspuns. Agentul nu poate preda singur când rămâne fără tokeni, deci verificarea stă la expeditor: dacă destinatarul n-a mai scris nimic și nu și-a salvat starea de peste o oră, `send` tipărește „B n-a mai fost activ de la 21:06; îi ține locul C” (din `state/` și din tabelul de înlocuitori).
- **Un singur cititor pe cursor.** `wait` refuză să pornească dacă alt `wait` al aceluiași agent e viu (PID, ca la lock), iar `inbox` rulat de mână cât timp un `wait` e pornit nu mută cursorul. La A, un mesaj a fost ratat și 7 `wait`-uri duble au fost oprite.
- **`handoff` arată ce comite.** La E, predarea a comis pe branch un fișier rămas din greșeală, fiindcă `cmd_handoff` face `git add -A` pe tot ce nu e secret. Fișierele urmărite se comit ca până acum; cele neurmărite se comit și ele, dar comanda le tipărește pe un rând („am comis și fișiere noi: …”), ca omul să le vadă.

**Gata când:** pe datele reale, pentru D în momentul cu cele mai multe fire deschise (pornirea care a avut 8,8 k caractere), `inbox` fără mesaje noi are cel mult 400 de caractere și `brief` cel mult 1,5 k, cu graful inclus. Regulile despre comms și graf au cel mult 3 k caractere pentru un non-lider (acum ~11 k).

## Etapa 2: botul preia rutina
| Ce | Unde | Cum |
|---|---|---|
| Firul de review se închide singur | pas nou în `dag.yml`, script nou `dag/pr_threads.py` | la PR aprobat, unit sau închis, botul scrie un `close` în firele deschise al căror prim mesaj e `review`, sau `ask` care pomenește exact acel `#N`; `unread` nu afișează mesajele `close` venite de la `dag` |
| Cererea de review o scrie botul | același script, la `opened` și `ready_for_review` | un `review` de la `dag` către recenzenții ceruți pe PR; `members/<nume>` primește și loginul de GitHub, scris de `install.py` |
| Prefixul branch-ului leagă PR-ul de task | **făcut** în `tasks-depend-DAG` (15 nov.) | rămâne de probat pe GitHub Actions; taskurile fără cod nu primesc `branch:` |
| Lista „În afara planului” | `render_markdown` | PR-urile nelegate de niciun task, grupate pe autor, cu numărul lor |
| „Poate începe” cere și strămoșii gata | `derive`, bucla finală | un task nu e „poate începe” cât timp un strămoș nu e gata, chiar dacă dependențele directe sunt unite |
| Mai puține commit-uri | `run` | `state.json` ține doar PR-urile legate de plan și se comite doar la o schimbare de stare |
| Mai puține rulări facturate | `dag.yml` | `synchronize` e deja scos. De măsurat dacă se poate scoate tot `pull_request`: 354 din cele 387 de rulări reușite pornite de PR-uri au fost pe un commit care avusese deja o rulare din `push`, deci ar dispărea până la 45% din minute. Trebuie verificat că legarea după prefix vede PR-ul și fără evenimentul `opened` |
| CI-ul proiectului nu pornește la mesaje | șablonul de workflow pentru teste | `push` doar pe `main`, plus `pull_request`, cu `concurrency` și `cancel-in-progress`; Windows doar pe PR-uri. La Cone Tuga, 201 din 565 de rulări au fost pornite de mesaje |

**Gata când:** pe istoricul real, D6 și E4 apar „în lucru”, 29 de PR-uri cu prefix sunt legate de taskuri, 103 apar în afara planului, M4 nu apare „poate începe” înaintea lui M3, niciun fir de review nu rămâne deschis după unirea PR-ului și botul face cel mult ~100 de commit-uri pe `dag` (au fost 330).

## Etapa 3: punctul de control ca o comandă
- `git comms checkpoint <Mx> probat|ok|pică "<ce>"` în `comms.py`: scrie un mesaj cu eticheta potrivită, ca omul să nu o mai scrie de mână.
  „probat” îl pune oricine; „ok” doar proprietarul taskului sau cine îi ține locul (fișierul `away/`); „pică” spune ce nu merge.
- `parse_tags` din `build_dag.py` învață `probat` și `pică`. Graful arată „probat de A, E; așteaptă omul”.
- `tasks.yaml` primește câmpul `due:` pe punctele de control (acum ora e doar în `note`).
- `notify_ready.py`: pentru un punct de control trimite `ask`, nu `fyi`, și îl repetă o dată la ora din `due:` dacă e încă nemarcat.

**Gata când:** pe istoricul real, M3 ar fi apărut „probat de A, E” de la 02:51 și liderul ar fi primit a doua cerere la 03:30.

## Etapa 4: bucla de noapte în sesiuni scurte (de probat întâi)
- `git comms wait --exec "<comandă>"`: când sosește un mesaj, rulează comanda, apoi așteaptă din nou. Comanda recomandată pornește o sesiune nouă, fără istoric, care rulează `git comms brief`, răspunde și se închide.
- Frână: cel mult N treziri pe oră (constantă cu nume), iar depășirea se scrie în `state/`.
- **Neprobat:** dacă o sesiune pornită așa are permisiunile de care are nevoie fără om. Se probează pe două clone înainte de orice altceva din etapă.

**Gata când:** 20 de mesaje sosite în 2 ore costă sub 5 M tokeni citiți din cache (la UiPath, bucla a citit ~21 M pe oră).

## Etapa 5: auto-merge pe reguli (doar după decizia 3)
- Un `roster.yml` cu fișierele fiecărui om. Un workflow unește un PR care atinge doar fișierele autorului și are CI verde. Contractele și planul rămân cu aprobare de om.

## Curățenie, oricând
- Scoate din CLI și din reguli `--cc`, `--needs`, `--due` și tipurile `approve`, `reject` (zero folosiri); mesajele vechi care le au trebuie să se citească în continuare.
- Scoate `[blocat]` și `[deblocat]` din reguli (zero folosiri reale); codul care le citește poate rămâne.
- Al doilea mesaj către aceiași destinatari în 2 minute intră în firul primului (`post`), ca ruperea în bucăți să nu deschidă fire noi.

## Reguli pentru cine construiește
- Botul nu cheamă niciun model. `comms.py` rămâne doar cu biblioteca standard. `PROTOCOL.md` rămâne pe o pagină, iar blocul pentru `CLAUDE.md` sub 15 rânduri.
- Fiecare schimbare vine cu un test; testele existente trec pe Windows și pe Ubuntu.
- Etapele se fac în ordine și fiecare se măsoară pe datele reale înainte de următoarea. Etapele 4 și 5 nu încep fără deciziile lui Cezar.
- Nu se schimbă nimic în `UiShapeshifter`: de acolo se iau doar sursele și datele.
