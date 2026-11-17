# ANALIZA-B: git comms și graful (DAG), agentul B

Fereastra: 2026-11-13T12:00Z → 2026-11-14T12:00Z (ora locală = UTC+2). Script: Python, doar biblioteca standard.
Sesiuni în fereastră: `55982ade` (pornită din folderul repo-ului) și `a37ea22d`
(pornită din folderul părinte al repo-ului, apoi lucru în repo). Le-am numărat pe amândouă.
[M] măsurat · [D] dedus · [?] nu se poate ști

| # | Ce | Valoare |
|---|---|---|
| 1 | Sesiuni / apeluri (după `message.id`) | 2 [M] / 794 [M] (`55982ade` 542, `a37ea22d` 252) |
| 1 | Tokeni noi (input + cache_creation) | 2.665.703 [M] (input 1.764, cache_creation 2.663.939) |
| 1 | Tokeni citiți din cache / scriși (output) | 329.592.670 [M] / 677.733 [M] |
| 1 | Modele | claude-opus-5-5: 782 apeluri, claude-fable-5-2: 12 [M] |
| 1 | Limita de usage atinsă | 2 ori [M]: 16:54 și 21:06, ambele în `a37ea22d` (resetare la 19:50) |
| 2 | Hook-uri cu `[comms]` | SessionStart 1 / 45 car.; UserPromptSubmit 11 / 5.296 car.; PostToolUse 5 / 1.711 car. [M] (toate în `55982ade`; 0 în `a37ea22d`) |
| 2 | Rânduri `[comms] deschis` / `nou` / `aștepți` | 0 / 0 car. · 24 / 6.356 car. · 1 / 45 car. [M] |
| 3 | `git comms` pe subcomandă (apeluri / car. în rezultat) | brief 45/46.142 · show 6/6.110 · wait 29/15.376 · send 17/2.191 · reply 22/5.202 · close 1/0 · state 12/1.309 · log 7/29.946 · handoff 1/0 · back 1/72 · inbox 0/0 · altele 2/316 [M] |
| 3 | Înlănțuite cu alte comenzi | 130 din 130 [M]; 127 conțin un `cd` [M] |
| 4 | `wait` pornite / notificări de încheiere legate | 29 (toate în fundal) [M] / 28 [M]; 1 fără notificare [M] |
| 4 | Citiri ale ieșirii unui `wait` | 26 citiri, 8.823 car. [M] |
| 5 | Citiri `DAG.md` / `dag/tasks.yaml` | 2 / 15.893 car. [M] · 6 / 16.676 car. [M] |
| 5 | Etichete în mesajele mele: gata / blocat / deblocat | 0 / 0 / 0 [M] |
| 6a | `CLAUDE.md` / `CLAUDE.local.md` (caractere) | 9.157 [M] / 12.372 [M]; `CLAUDE.local.md` e în rădăcina repo-ului [M] |
| 6b | `CLAUDE.local.md` față de `docs/agenti/CLAUDE.local-B.md` | nu e identic cu niciuna dintre cele 4 versiuni [M]; 50 de rânduri diferite față de cea mai nouă (`b6a1603`, 2026-11-13 17:36) [M] |
| 7 | Prompturi / doar „verifică / răspunde la mesaje” | 63 [M] / 11 [D] (≤150 car. și cuvinte-cheie) |
| 7 | Pe ore (local; prompturi/apeluri/cache citit, mil.) | 14h 3/19/1,3 · 15h 4/81/16,1 · 16h 5/76/28,6 · 17h 0/1/0,5 · 19h 2/12/5,1 · 20h 4/60/33,7 · 21h 1/3/1,9 · 00h 2/32/2,7 · 01h 7/141/38,9 · 02h 1/36/13,9 · 03h 0/16/6,5 · 05h 0/6/2,1 · 07h 1/3/0,9 · 08h 9/85/38,8 · 09h 3/71/38,3 · 10h 1/3/1,7 · 11h 10/75/46,5 · 12h 10/73/51,3 · 13h 0/1/0,7 [M] |
| 7 | Ore cu apeluri, fără prompt / max. cache_read într-un apel | 17h, 03h, 05h, 13h [M] / 747.851 (`55982ade`, 13:34) [M] |
| 8 | Mesaje trimise de mine, pe tip | ask 23 · answer 18 · fyi 10 · close 3 · contract 2 [M]; +1 trimis de C „for B” [M] |
| 8 | Primite (către B sau `all`) | 94 [M] (fyi 32, answer 28, ask 24, close 6, contract 2, review 2) |
| 8 | Până răspund la o cerere: mediana / p90 | 5,3 min / 104,9 min [M] (20 din 28 de cereri către mine) |
| 8 | Cereri către mine fără răspuns în comms | 8 [M]: 1630-C-2fs, 1805-D-bvw, 2335-C-k65, 0209-C-qa7, 0318-C-tn3, 0740-E-xwg, 1000-D-nhu, 1117-E-veq |
| 9a | cwd de pornire și hook-uri `git comms inbox` | `55982ade`: repo, da [M] · `a37ea22d`: folderul părinte al repo-ului, nu (acolo `settings.json` n-are hook-uri) [M] |
| 9b | Trimiteri refuzate, pe motiv | 2 [M]: altul 2 [D] (lungime 0, necitite 0, fir prea lung 0, destinatar 0); `a37ea22d` 16:16 și 20:34 |
| 9c | Notificări `wait`: încheiate / oprite / eșuate | 27 / 1 / 0 [M] · `inbox` de mână în timpul unui `wait`: 0 [M] · max. `wait` simultane: 2 [M] |
| 9d | Din cererile fără răspuns: cu `#N` sau review | 4 din 8 [M] |
| 9e | `handoff` / `back` făcute de mine | handoff 16:53 (B→C) / back 19:54, în `a37ea22d` [M] |
| 9e | Ore din fereastră fără niciun apel la model | 18h, 22h, 23h, 04h, 06h [M] |

## Momente

Au ajutat:
1. `a37ea22d` 16:53: `handoff` către C cu un minut înainte de limita de usage (16:54); `back` la 19:54, după resetare.
2. `55982ade` 02:00: prima dintre cele 27 de treziri prin `wait` încheiat; mediana de răspuns la cereri a ieșit 5,3 min.
3. `55982ade` 00:52: citirea `DAG.md` la pornirea sesiunii de noapte (2 citiri în total, 15.893 car.).

Au încurcat sau au fost ocolite:
1. `a37ea22d` 14:45: sesiunea a pornit din folderul părinte, fără hook-uri: 0 rânduri `[comms]` în 6,5 h de lucru și 53 de comenzi `git comms` rulate de mână.
2. `55982ade` 00:52: 130 din 130 de comenzi `git comms` sunt înlănțuite (127 cu `cd`), deși regula spune „fără `cd`”.
3. `a37ea22d` 16:16 și 20:34: `reply`/`send` refuzate („netrimis”), motiv în afara celor 4 categorii; 8 cereri către mine au rămas fără răspuns în comms (prima la 16:30).

Text de comms și graf ≈ 155.108 car. / 3 ≈ 51.703 tokeni, adică **1,94% din tokenii mei noi** [D] (hook-uri 7.052, rezultate `git comms` 106.664, citiri `wait` 8.823, graf 32.569 car.).
