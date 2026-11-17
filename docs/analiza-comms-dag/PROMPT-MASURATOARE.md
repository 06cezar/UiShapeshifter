# Promptul de măsurare

Promptul pe care l-a primit agentul fiecărui coleg pe 15–16 nov. 2026, pe calculatorul lui. Din el au ieșit rapoartele din `rapoarte/`.

- B, C și E au primit versiunea de mai jos.
- A a primit întâi o versiune fără punctul 9 și fără arhivă; punctul 9 i-a fost trimis separat, iar raportul din `rapoarte/ANALIZA-A.md` e cel de după.
- Raportul lui D a fost făcut cu același prompt, de alt agent, pe calculatorul lui Cezar.

```text
Vreau o măsurătoare a felului în care am folosit `git comms` și graful de taskuri (DAG) la hackathonul UiPath, pe calculatorul acesta. Rezultatul merge la Cezar, care adună cifrele de la toți cinci. Răspunde în română.

Reguli:
- Doar citești, cu două excepții: scrii raportul și faci arhiva de la final. Nu comiți, nu împingi, nu schimbi branch-ul, nu trimiți mesaje `git comms`, nu citești `.comms/` de mână.
- Nu citi transcrierile în context: scrie un singur script Python (doar biblioteca standard, în folderul temporar al sesiunii) care scoate numere, și rulează-l.
- În raport pui doar numere și id-uri de sesiune. Fără textul prompturilor mele și fără textul mesajelor.
- Marchează fiecare cifră: [M] măsurat, [D] dedus, [?] nu se poate ști. Dacă ceva nu se poate măsura, scrie asta; nu estima în locul lui.

Date:
- Cine sunt: `git config comms.me`.
- Transcrierile: `~/.claude/projects/<folderul acestui repo>/*.jsonl` (numele folderului e calea repo-ului cu `-` în loc de separatori). Ia doar fișierele din rădăcina folderului, fără subfoldere. Dacă folderul lipsește sau nu are rânduri în fereastră, caută și în folderele părinților repo-ului și spune în raport din ce folder (`cwd`) au rulat sesiunile.
- Fereastra: 2026-11-13T12:00Z → 2026-11-14T12:00Z (câmpul `timestamp`, în UTC).
- Capcană: sesiunile bifurcate sau reluate copiază istoricul în alt fișier. Numără o singură dată: apelurile după `message.id`, comenzile după id-ul blocului `tool_use`, hook-urile după `uuid`, notificările după (task-id, stare).
- Structura: rândurile `type: assistant` au `message.usage`, `message.model` și blocuri `tool_use` (comanda e în `input.command`); rezultatele sunt blocuri `tool_result` în rândurile `type: user`; hook-urile sunt rânduri cu `attachment.hookEvent` și `attachment.content`. Un hook `PostToolUse` lasă două rânduri (`hook_success` și `hook_additional_context`): numără-l o singură dată, după `toolUseID`.
- Mesajele echipei: `git fetch origin comms`, apoi `git ls-tree -r origin/comms` și `git show`.

Ce măsori:
1. Consum: sesiuni, apeluri, tokeni noi (`input_tokens` + `cache_creation_input_tokens`), tokeni citiți din cache, tokeni scriși, modelele folosite. De câte ori am atins limita de usage și la ce ore.
2. Hook-uri cu `[comms]` în conținut, pe `SessionStart`, `UserPromptSubmit`, `PostToolUse`: de câte ori și câte caractere. Separat, câte rânduri și caractere încep cu `[comms] deschis`, `[comms] nou`, `[comms] aștepți`.
3. Comenzi `git comms <subcomandă>`: apeluri și caractere în rezultat, pe subcomandă (`brief`, `show`, `wait`, `send`, `reply`, `close`, `state`, `log`, `handoff`, `back`, `inbox`). Spune câte sunt înlănțuite cu alte comenzi.
4. `wait`: de câte ori a fost pornit și câte notificări de încheiere (`<task-notification>` legate de un `wait` prin task-id) au sosit. Separat, câte citiri ale ieșirii unui `wait` (de exemplu `cat …output`) și câte caractere.
5. Graful: câte citiri ale `DAG.md` (de exemplu `git show origin/dag:DAG.md`) și ale `dag/tasks.yaml`, cu caracterele din rezultat. Câte etichete `[gata …]`, `[blocat …]`, `[deblocat …]` am pus în mesajele mele.
6. Reguli:
   a. Câte caractere au `CLAUDE.md` și `CLAUDE.local.md` de aici, și în ce folder stă `CLAUDE.local.md` (rădăcina repo-ului sau altundeva; dacă lipsește, scrie asta).
   b. Cu ce versiune din repo e identic `CLAUDE.local.md`, fără terminațiile de rând: compară-l cu fiecare versiune din `git log origin/main -- docs/agenti/CLAUDE.local-<litera mea>.md` și dă commit-ul cu care se potrivește, data lui și câte versiuni mai noi există. Dacă nu se potrivește cu niciuna, spune câte rânduri diferă față de cea mai nouă.
7. Prompturile mele: câte în total și câte cer doar „verifică / răspunde la mesaje”. Pe ore: prompturi, apeluri și tokeni citiți din cache. Scoate orele cu apeluri, dar fără niciun prompt, și cel mai mare `cache_read_input_tokens` dintr-un singur apel.
8. Mesajele mele pe `origin/comms`: trimise (pe tip), primite (adresate mie sau `all`), mediana și p90 în minute până răspund la o cerere (`ask`, `review`, `contract`) și câte cereri către mine n-au primit răspuns în comms.
9. Instalare și livrare:
   a. Din ce folder (`cwd`) au pornit sesiunile și dacă acolo există `.claude/settings.json` cu hook-urile `git comms inbox`.
   b. Trimiteri refuzate de `git comms` (rezultate cu „netrimis” sau „refuz”), numărate pe motiv: lungime, mesaje necitite în fir, fir prea lung, destinatar necunoscut, altul.
   c. Notificările de `wait` pe stare (încheiate, oprite, eșuate), de câte ori `git comms inbox` a fost rulat de mână cât timp un `wait` era pornit și câte `wait`-uri au fost pornite deodată, cel mult.
   d. Din cererile către mine fără răspuns în comms, câte pomenesc un PR (`#N`) sau cer review.
   e. `handoff` și `back` făcute de mine, cu ora locală, și orele din fereastră fără niciun apel la model.

Apoi, din ce găsești în sesiuni: cel mult 3 momente în care comms sau graful au ajutat și cel mult 3 în care au încurcat ori au fost ocolite, fiecare cu primele 8 caractere din id-ul sesiunii și ora locală.

Gata înseamnă: fișierul `ANALIZA-<litera mea>.md` în rădăcina repo-ului, necomis, cel mult 70 de rânduri, cu un tabel pentru punctele 1–9 în ordinea de mai sus și lista de momente. Afișează-l și în răspuns. La final, o propoziție: cât la sută din tokenii mei noi a fost text de comms și graf (caractere / 3 ≈ tokeni, marcat [D]).

Apoi fă arhiva `analiza-<litera mea>.zip` în folderul meu Downloads, cu exact două fișiere: `ANALIZA-<litera mea>.md` și o copie a lui `CLAUDE.local.md` așa cum e acum, nemodificat, pusă în arhivă sub numele `CLAUDE.local-<litera mea>.md`. Dacă `CLAUDE.local.md` lipsește, pune doar raportul și spune asta. Nu pune altceva în arhivă. Încheie cu calea completă a arhivei, pe care i-o trimit lui Cezar.
```
