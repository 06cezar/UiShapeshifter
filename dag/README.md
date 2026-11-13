# dag/: graful „Cine pe cine așteaptă”

Ghiduri complete: [pentru oameni](../docs/GHID-OAMENI.md) · [pentru agenți](../AGENTS.md).

| Fișier | Cine îl scrie | Ce e |
|---|---|---|
| `tasks.yaml` | **oamenii**, prin PR | planul: taskuri, cine, dependențe, PR/branch |
| `build_dag.py` | — | scriptul: deduce stările și desenează, fără AI |
| `notify_ready.py` | — | trimite prin `git comms` mesajul „X poate începe” proprietarilor |
| `state.json` | **scriptul**, pe branch-ul `dag` | cursoarele (ultimul commit de pe main și de pe comms, ultima rulare), faptele știute și stările de data trecută |
| `DAG.md` | **scriptul**, pe branch-ul `dag` | rezultatul: bloc Mermaid, desenat de GitHub, și lista de sub el |
| `../.github/workflows/dag.yml` | — | rulează scriptul la push, la PR și la mesajele comms cu etichetă; scrie pe `dag`, apoi anunță |
| `../COMMS-RULES.md` | — | etichetele `[blocat …]`, `[deblocat …]`, `[gata …]` din mesajele `git comms` |

## Cum se deduce starea

Primul care se potrivește câștigă:

1. `status` forțat în `tasks.yaml`
2. PR-ul taskului e unit → **gata**
3. `[gata ID]` într-un mesaj `git comms` (sau într-un `*COMMS.md` vechi) → **gata**
4. `[blocat ID …]` la fel → **blocat**
5. PR deschis, sau `branch` cu commit-uri care nu sunt în main → **în lucru**
6. toate `depends_on` sunt gata → **poate începe**
7. altfel → **așteaptă**, cu lista exactă

Un PR închis fără merge nu contează. Dacă taskul are `branch` și nu are `pr`, PR-ul se caută după branch.

## Ce citește la fiecare rulare

- PR-urile schimbate de la `last_run` (cu 5 minute în plus, ca să nu scape nimic):
  `gh pr list --state all --search "updated:>=…"`;
- mesajele adăugate pe branch-ul `comms` de la `last_comms_sha` (`origin/comms`, altfel `comms` local), doar textul de sub antet;
- liniile adăugate în `*COMMS.md` de pe `main` de la `last_sha` (compatibilitate cu inbox-urile vechi).

Etichetele din cele două surse se aplică în ordinea datei commit-ului. Taskurile care tocmai au trecut din
„așteaptă”/„blocat” în „poate începe” ajung în fișierul dat cu `--ready-out`; workflow-ul le trimite cu `notify_ready.py`.

Dacă nu s-a schimbat nimic, scriptul nu scrie nimic și nici cursorul nu se mută, deci nu apare niciun commit.
Dacă `state.json` lipsește sau e stricat, ori `last_sha` a dispărut din istoric (force-push), face o rulare completă.
Dacă `last_comms_sha` lipsește sau nu mai e pe `comms`, recitește tot branch-ul `comms`.

## Local

```bash
pip install pyyaml pytest
python dag/build_dag.py            # incremental, ~2 s
python dag/build_dag.py --full     # de la zero
python dag/build_dag.py --no-github  # fără `gh` (PR-urile rămân cele din state.json)
python dag/build_dag.py --out OUT --ready-out ready.json  # ca în workflow: rezultatul în OUT
python -m pytest dag/tests -q
```

## Când se schimbă planul (singurul loc pentru AI)

Taskuri noi, altă împărțire, o dependență greșită: pornește o sesiune **nouă și scurtă** cu promptul

> Citește `dag/tasks.yaml`, graful (`git show origin/dag:DAG.md`) și mesajele recente (`git comms log`).
> Propune un PR la `dag/tasks.yaml`.

Nu pune niciodată AI pe cron.
