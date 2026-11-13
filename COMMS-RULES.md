# Etichete pentru graf, în mesajele `git comms`

Etichetele de mai jos le spun grafului ce nu se vede din GitHub: că un task e blocat sau gata fără PR.
**Le scrii într-un mesaj `git comms`**, oriunde în text. Restul mesajului e liber.

```bash
git comms send C "Am nevoie de schema ta. [blocat A2 de C1]" --type fyi
```

Mesajul ajunge pe branch-ul `comms`. Commit-ul lui primește singur `[dag]` în subiect, iar `dag-trigger.yml`
pornește redesenarea grafului în câteva secunde. Mesajele fără etichete nu pornesc nimic.

| Scrii | Efect |
|---|---|
| `[blocat A2 de C1]` | A2 devine **blocat**, de C1 |
| `[blocat A2: aștept cheia API]` | A2 devine **blocat**, cu motivul scris |
| `[blocat A2 de Maria: serverul e jos]` | amândouă |
| `[deblocat A2]` | scoate blocajul; A2 revine la starea dedusă din GitHub |
| `[gata A3]` | A3 devine **gata** fără PR (muncă de laborator, hardware, demo) |
| `[gata A1, B1]` · `[blocat A2, A3 de C1]` | aceeași etichetă pentru mai multe taskuri, separate prin virgulă |

Reguli:

- **Pune mereu id-ul taskului** (cel din `dag/tasks.yaml`). `[blocat de C1]` fără id e ignorat,
  pentru că scriptul nu știe ce task e blocat.
- Majusculele nu contează, nici la cuvânt, nici la id: `[Gata a3]` e același lucru cu `[gata A3]`.
- Punctuația lipită de id nu contează: `[gata A3.]` e `[gata A3]`.
- **Blocajul „de X” cade singur** când X (un task din plan) e gata: `[blocat A2 de C1]`, apoi C1 gata →
  A2 nu mai e blocat și proprietarul lui primește „poate începe”. Fără `[deblocat]` de mână.
  Blocajele cu motiv (`[blocat A2: cheia API]`) sau de un om (`de Maria`) rămân până la `[deblocat A2]`.
- **„De când”** e data commit-ului care a adus mesajul.
- **Se citesc doar mesajele noi.** Un mesaj nu se editează; ca să anulezi, trimiți altul (`[deblocat A2]`).
- Doar textul mesajului contează, nu antetul (`from`, `to`, `re`…).
- Un PR unit bate eticheta `[blocat]`: taskul e gata.
- O stare forțată în `tasks.yaml` (`status: blocked` etc.) bate orice etichetă.
- Un id care nu e (încă) în `tasks.yaml` apare ca avertisment în log; eticheta e ținută minte și se aplică
  când taskul e adăugat în plan.

## Și invers: graful vă scrie

Când un task trece din „așteaptă” sau „blocat” în „poate începe”, workflow-ul îi trimite proprietarului
(`owner` din `tasks.yaml`) un mesaj `git comms` de la membrul `dag`, de exemplu:

```
A2 (Parser) poate începe: A1 e gata. Graful: DAG.md pe branch-ul dag.
```

Fiecare trecere e anunțată o singură dată. Prima rulare și taskurile abia adăugate în plan nu sunt anunțate.
Pentru asta, `owner` din `tasks.yaml` trebuie să fie exact numele cu care colegul e înscris în comms.

## Inbox-urile vechi (`*COMMS.md`)

Pentru compatibilitate, scriptul citește în continuare și liniile **adăugate** în orice fișier `*COMMS.md`
de pe `main` (modelul de la SmartHack). Nu le folosiți pentru lucruri noi: un singur loc, mesajele `git comms`.
