# Analiza comms și a grafului după hackathonul UiPath (13–14 nov. 2026)

Cum au mers `git comms` (v2) și graful de taskuri (DAG) la hackathon, cât au costat și ce propunem să schimbăm.
Analiza a fost făcută pe 15–16 nov. 2026. Din propuneri nu e implementat nimic în `tools/comms/`.

## Ce citești, în ordine
| Fișier | Ce e |
|---|---|
| `ANALIZA-COMMS.md` | Mesajele: v2 față de v1 (SmartHack), costul în context, firele, `wait` și predarea. Secțiunea 8 are tabelul cu toți cei cinci agenți. |
| `ANALIZA-DAG.md` | Graful: cât de corect a arătat starea, punctele de control, costul în tokeni și în GitHub Actions. |
| `BRIEF-V3.md` | Ce propunem să schimbăm, pe etape, cu „gata când” pentru fiecare. Trei decizii rămân la Cezar. |
| `SCHIMBARI-DAG.md` | Ce s-a schimbat deja în codul grafului pe 15 nov. (în folderul `tasks-depend-DAG`, nu în acest repo). |

## De unde vin cifrele
| Fișier | Ce e |
|---|---|
| `PROMPT-MASURATOARE.md` | Promptul cu care agentul fiecăruia și-a măsurat propriile sesiuni. |
| `rapoarte/ANALIZA-A.md` … `ANALIZA-E.md` | Rapoartele brute, câte unul pe agent, nemodificate. Excepție: din raportul lui B au fost scoase căile locale de pe calculatorul lui. |
| `rapoarte/CLAUDE.local-A.md` … `CLAUDE.local-E.md` | `CLAUDE.local.md` al fiecărui agent, așa cum era pe 16 nov., când s-a făcut măsurătoarea. |

Cifrele despre mesaje au fost verificate separat pe branch-ul `comms`, cu aceeași metodă pentru toți cinci.
Marcajele: **[M]** măsurat, **[D]** dedus, **[?]** nu se poate ști.

## Ce `CLAUDE.local.md` a folosit fiecare
Fișierele sunt în `rapoarte/`. Coloana a doua spune cu ce versiune din istoricul lui `docs/agenti/CLAUDE.local-<literă>.md` e identic fiecare, fără terminațiile de rând.

| Agent | Identic cu | Observații |
|---|---|---|
| A | `ace6820` (vineri 14:41), prima versiune | dinaintea pivotului; trei versiuni mai noi. [?] Raportul lui A măsoară însă 13.929 de caractere, cât `b6a1603`: de confirmat ce fișier a avut agentul în sesiune |
| B | niciuna: `3d590ac` (vineri 15:50), a treia, plus o secțiune proprie de 5 rânduri la final | dinaintea pivotului |
| C | `b6a1603` (vineri 17:36), ultima | |
| D | `b6a1603` (vineri 17:36), ultima | luat din repo: fișierul local a fost scurtat pe 16 nov., după analiză |
| E | `b6a1603` (vineri 17:36), ultima | |

A, B, C și E sunt copiile trimise de colegi odată cu rapoartele.

## Limite
- Din sesiunile lui C au rămas 4,5 ore din 24; restul transcrierilor au fost șterse înainte de măsurare.
- La A și E sesiunile au pornit din folderul părinte al repo-ului, deci nu se vede cât din reguli a fost în context.
- Din v1 (SmartHack) au rămas pe disc doar ultimele 5 ore.
- Tokenii din caractere sunt estimați la ~3 caractere pe token.
