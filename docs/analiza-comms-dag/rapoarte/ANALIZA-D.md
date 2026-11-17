# ANALIZA-D: `git comms` și graful, agentul D (Cezar)

Fereastra: 2026-11-13T12:00Z → 2026-11-14T12:00Z; orele de mai jos sunt locale (UTC+2).
Sursa: 79 de transcrieri din `~/.claude/projects/C--Users-cioci-Desktop-UiShapeshifter/` (doar rădăcina) și `origin/comms`.
Marcaje: [M] măsurat, [D] dedus, [?] nu se poate ști. Numărat o singură dată (message.id, id tool_use, uuid, task-id + stare).

| # | Ce | Cifre |
|---|---|---|
| 1 | Consum | 79 sesiuni [M] (78 cu apeluri proprii după deduplicare) · 3 064 apeluri [M] · tokeni noi 7 330 719 [M] · citiți din cache 630 176 528 [M] · scriși 1 837 817 [M] |
| 1 | Modele (apeluri) | opus-5-5 2 385 · fable-5-2 368 · sonnet-5-5 296 · opus-4-8 10 · haiku-5-5 5 [M] |
| 1 | Limita de usage | 4 atingeri ale limitei de 5 ore [M]: 13 nov. 16:42, 19:37, 23:29 și 14 nov. 00:57; plus un rând meta „Usage limit” la 14 nov. 02:08 [M] |
| 2 | Hook-uri cu `[comms]` | SessionStart 79 / 200 140 car. · UserPromptSubmit 33 / 10 713 · PostToolUse 31 / 12 804 · total 143 / 223 657 [M] |
| 2 | Rânduri din hook-uri | `[comms] deschis` 724 / 181 600 car. (doar 52 de fire distincte) · `[comms] nou` 122 / 30 091 · `[comms] aștepți` 70 / 6 488 [M] |
| 3 | Comenzi (apeluri / car. rezultat / înlănțuite) | brief 34 / 186 029 / 30 · show 41 / 51 084 / 39 · wait 123 / 47 727 / 100 · send 89 / 7 309 / 77 · reply 68 / 16 102 / 62 · close 14 / 7 480 / 14 · state 41 / 5 946 / 32 · log 5 / 17 811 / 5 · handoff 1 / 147 / 0 · back 1 / 34 / 1 · inbox 0 [M] |
| 3 | Total comenzi | 417 apeluri în 349 de blocuri tool_use, 339 669 car.; 292 de blocuri sunt înlănțuite cu alte comenzi, deci caracterele lor includ și ieșirea acelora [M] |
| 4 | `wait` | pornit de 123 de ori, toate în fundal, în 11 sesiuni [M] · 124 notificări de încheiere legate de un wait prin task-id [M]; 76 pomenesc literal „comms” [M] · 120 citiri ale ieșirii, 63 642 car. [M] |
| 5 | Graful | `DAG.md` citit de 33 de ori, 208 000 car. · `dag/tasks.yaml` de 29 de ori, 89 156 car. [M] (rezultatele comenzilor înlănțuite includ și alt text) |
| 5 | Etichete puse de mine | `[gata …]` 4 · `[blocat …]` 1 · `[deblocat …]` 1, în 6 mesaje [M] |
| 6 | Reguli | `CLAUDE.md` 9 255 car. · `CLAUDE.local.md` 17 632 car. [M] |
| 7 | Prompturi | 376 [M] (359 rânduri de utilizator + 17 puse în coadă în timpul unei ture) · 10 cer doar „verifică / răspunde la mesaje” [D] (potrivire pe cuvinte, prompturi ≤ 200 car.) |
| 7 | Ore cu apeluri, fără prompt | 14 nov. 03, 04, 05, 06 [M]: 290 de apeluri, 282 115 tokeni noi, 71 968 787 citiți din cache |
| 7 | Cel mai mare `cache_read` într-un apel | 627 409 [M] (sesiunea `290d2f54`, 14 nov. 12:01, opus-5-5) |
| 8 | Trimise de mine | 220 [M]: answer 62 · ask 55 · close 50 · fyi 42 · contract 7 · review 4; 33 565 car. |
| 8 | Primite | 275 [M] (268 adresate mie, 7 către `all`): answer 90 · fyi 75 · ask 73 · review 28 · contract 6 · close 3 |
| 8 | Timp până răspund | 107 cereri către mine (73 ask, 28 review, 6 contract); 91 cu răspuns: mediana 16,1 min, p90 388,4 min [M]; 36 în ≤ 5 min, 35 după > 60 min |
| 8 | Cereri fără răspuns în comms | 16 [M] (14 ask, 2 contract); toate sunt în fire închise apoi de altcineva [M] |
| 9a | De unde au pornit sesiunile | toate 79 din rădăcina repo-ului [M]; acolo există `.claude/settings.json` cu cele 3 hook-uri `git comms inbox` [M] |
| 9b | Trimiteri refuzate | lungime 2 · mesaje necitite în fir 0 · fir prea lung 0 · destinatar necunoscut 0 · altul 2 (trimis cât lucrul era predat) [M] |
| 9c | Notificări `wait` pe stare | încheiate 120 · oprite 4 · eșuate 0 [M] · `git comms inbox` rulat de mână: 0 [M] |
| 9d | Din cele 16 fără răspuns | 8 pomenesc un PR (`#N`) sau cer review; 5 au `#N` [M] |
| 9e | `handoff` / `back` | handoff 13 nov. 16:36 (`1eb19ceb`), back 13 nov. 17:26 (`d9b26405`) [M] · ore din fereastră fără niciun apel: niciuna [M] |

Pe ore, prompturi / apeluri / milioane de tokeni citiți din cache [M]:
13 nov.: 14 5/29/2,8 · 15 8/52/6,7 · 16 39/219/24,1 · 17 11/68/9,1 · 18 18/87/20,0 · 19 10/71/23,0 · 20 24/107/16,8 · 21 17/185/30,9 · 22 10/121/44,3 · 23 10/98/45,5
14 nov.: 00 32/234/45,5 · 01 19/88/9,8 · 02 22/202/23,7 · 03 0/105/16,9 · 04 0/68/16,9 · 05 0/41/12,0 · 06 0/76/26,1 · 07 1/70/25,4 · 08 5/61/28,3 · 09 2/18/6,2 · 10 25/233/56,5 · 11 43/362/75,8 · 12 54/385/55,7 · 13 21/84/8,3

## Momente în care au ajutat

- `290d2f54`, 14 nov. 03:00–07:00: patru ore fără niciun prompt; bucla de `wait` a pornit de 54 de ori, au sosit 30 de cereri și au plecat 36 de mesaje (22 answer) [M].
- `1eb19ceb`, 13 nov. 16:36: `handoff` către E cu 6 minute înainte de limita de usage de la 16:42 (`9f53b27d`); `back` la 17:26 [M].
- `021a5779`, 13 nov. 18:10: „poate începe” de la `dag` a sosit prin hook (5 astfel de livrări în total) [M]. Din 31 de hook-uri PostToolUse cu mesaj nou, 22 au fost urmate de un răspuns în ≤ 10 min în aceeași sesiune [M].

## Momente în care au încurcat ori au fost ocolite

- `290d2f54`, 14 nov. 09:56: cel mai mare hook SessionStart, 8 802 car. Aceleași 52 de fire deschise au fost reinjectate în 724 de rânduri (181 600 car., 81% din textul hook-urilor) [M].
- `4bbba5ff`, 13 nov. 16:16: branch-ul `origin/comms` citit de mână, de 3 ori la rând; în total 16 citiri de mână (14 din `origin/comms`, 2 din `.comms/`), 37 591 car. [M].
- `025e8b6a` și `fe584168`, 14 nov. 00:56: două sesiuni trezite de același mesaj în același minut; apoi au ținut câte un `wait` 91 și 93 de minute, până au fost oprite la 02:49 [M]. Maximum 4 `wait` pornite deodată (14 nov. 11:19) [M].

## Ce nu acoperă măsurătoarea

- Transcrierile subagenților (4 subfoldere, 5 apeluri `Agent`) nu sunt numărate, conform regulii „doar rădăcina” [M].
- Hook-urile fără ieșire nu lasă rând în transcriere, deci nu se știe de câte ori au rulat în total [?].
- Comenzile `git comms` tastate de om în terminal nu apar în transcrieri [?].
- Cât din `CLAUDE.md` și `CLAUDE.local.md` e text despre comms și graf nu am măsurat; nu intră în procentul de mai jos.

Text de comms și graf: 861 607 caractere (hook-uri 223 657 + rezultate de comenzi, citiri de `wait` și de graf 637 950, fiecare bloc o singură dată) ≈ 287 202 tokeni, adică **3,9% din tokenii mei noi** [D] (comms 2,85%, graful 1,07%).
