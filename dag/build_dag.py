#!/usr/bin/env python3
"""Graful „Cine pe cine așteaptă”, fără AI.

Citește planul din dag/tasks.yaml, deduce starea fiecărui task din GitHub
(PR-uri, branch-uri) și din etichetele noi din mesajele `git comms` (branch-ul
`comms`) și din inbox-urile vechi *COMMS.md, apoi scrie DAG.md (bloc Mermaid +
listă) și dag/state.json (cursorul).

Rulare:  python dag/build_dag.py            # incremental (de la cursor)
         python dag/build_dag.py --full     # reconstruiește tot
         python dag/build_dag.py --no-github  # fără `gh`, doar git + tasks.yaml
         python dag/build_dag.py --out OUT --ready-out ready.json
                # DAG.md și dag/state.json în OUT (worktree-ul branch-ului `dag`),
                # plus lista taskurilor care tocmai au trecut în „poate începe”

Nu scrie nimic dacă nu s-a schimbat nimic, deci rularea repetată e sigură.
"""
from __future__ import annotations

import argparse
import copy
import datetime as dt
import json
import re
import subprocess
import sys
from pathlib import Path
from typing import Callable, Iterable

import yaml

# --------------------------------------------------------------------------
# Stări
# --------------------------------------------------------------------------

STATUSES = ("done", "progress", "ready", "wait", "blocked")
LABEL = {
    "done": "gata",
    "progress": "în lucru",
    "ready": "poate începe",
    "wait": "așteaptă",
    "blocked": "blocat",
}
ICON = {"done": "✅", "progress": "🔨", "ready": "🟢", "wait": "⏳", "blocked": "⛔"}
# fill, stroke, text — contrast bun pe fundal alb și negru (GitHub)
STYLE = {
    "done": ("#d3f5dc", "#1a7f37", "#0b3d1a"),
    "progress": ("#d6e8ff", "#0969da", "#0a2d5c"),
    "ready": ("#fff4c2", "#9a6700", "#4d3300"),
    "wait": ("#eaeef2", "#6e7781", "#24292f"),
    "blocked": ("#ffd8d3", "#cf222e", "#5c0b10"),
}

ROOT = Path(__file__).resolve().parent.parent
PR_OVERLAP = dt.timedelta(minutes=5)  # căutăm PR-urile puțin înainte de cursor


class PlanError(ValueError):
    """tasks.yaml e invalid."""


class PRFetchError(RuntimeError):
    """`gh` nu a putut citi PR-urile."""


def warn(msg: str) -> None:
    print(f"[dag] {msg}", file=sys.stderr)


# --------------------------------------------------------------------------
# Pasul 1: tasks.yaml
# --------------------------------------------------------------------------

def load_tasks(path: Path) -> list[dict]:
    """Citește și validează planul. Ridică PlanError cu un mesaj clar."""
    try:
        raw = yaml.safe_load(Path(path).read_text(encoding="utf-8"))
    except yaml.YAMLError as e:
        raise PlanError(f"{path}: YAML invalid: {e}") from e
    if raw is None:
        raw = []
    if not isinstance(raw, list):
        raise PlanError(f"{path}: trebuie să fie o listă de taskuri")

    tasks: list[dict] = []
    seen: set[str] = set()
    for i, item in enumerate(raw, 1):
        where = f"{path}, taskul #{i}"
        if not isinstance(item, dict):
            raise PlanError(f"{where}: fiecare task e un dicționar (id, owner, ...)")
        tid = str(item.get("id") or "").strip()
        if not tid:
            raise PlanError(f"{where}: lipsește `id`")
        where = f"{path}, taskul {tid}"
        if tid in seen:
            raise PlanError(f"{where}: `id` duplicat")
        seen.add(tid)
        owner = str(item.get("owner") or "").strip()
        if not owner:
            raise PlanError(f"{where}: lipsește `owner`")

        deps = item.get("depends_on") or []
        if isinstance(deps, str):
            deps = [deps]
        if not isinstance(deps, list):
            raise PlanError(f"{where}: `depends_on` e o listă")
        deps = [str(d).strip() for d in deps if str(d).strip()]

        status = str(item.get("status") or "auto").strip().lower()
        if status not in (*STATUSES, "auto"):
            raise PlanError(
                f"{where}: `status: {status}` necunoscut; folosește auto, "
                + ", ".join(STATUSES)
            )

        pr = item.get("pr")
        if pr is not None:
            try:
                pr = int(str(pr).lstrip("#"))
            except ValueError:
                raise PlanError(f"{where}: `pr` trebuie să fie un număr") from None
        branch = item.get("branch")
        branch = str(branch).strip() if branch else None

        tasks.append({
            "id": tid,
            "owner": owner,
            "title": str(item.get("title") or tid).strip(),
            "depends_on": deps,
            "pr": pr,
            "branch": branch,
            "status": status,
            "note": str(item.get("note") or "").strip(),
        })

    for t in tasks:
        for d in t["depends_on"]:
            if d == t["id"]:
                raise PlanError(f"{path}, taskul {t['id']}: depinde de el însuși")
            if d not in seen:
                raise PlanError(f"{path}, taskul {t['id']}: depinde de `{d}`, care nu există")
    _check_cycles(tasks, path)
    return tasks


def _check_cycles(tasks: list[dict], path: Path) -> None:
    indeg = {t["id"]: len(set(t["depends_on"])) for t in tasks}
    users: dict[str, list[str]] = {t["id"]: [] for t in tasks}
    for t in tasks:
        for d in set(t["depends_on"]):
            users[d].append(t["id"])
    queue = [tid for tid, n in indeg.items() if n == 0]
    while queue:
        tid = queue.pop()
        for u in users[tid]:
            indeg[u] -= 1
            if indeg[u] == 0:
                queue.append(u)
    stuck = sorted(tid for tid, n in indeg.items() if n > 0)
    if stuck:
        raise PlanError(f"{path}: dependențe circulare între {', '.join(stuck)}")


# --------------------------------------------------------------------------
# Pasul 2: starea din GitHub
# --------------------------------------------------------------------------

def merge_prs(facts: dict, prs: Iterable[dict]) -> None:
    """Pune PR-urile citite peste cele știute. Păstrăm doar ce contează pentru
    stare, ca un comentariu pe PR să nu schimbe state.json."""
    for p in prs:
        facts[str(p["number"])] = {
            "state": str(p.get("state") or "").upper(),
            "head": p.get("headRefName") or "",
            "merged_at": p.get("mergedAt") or None,
        }


_PR_RANK = {"MERGED": 0, "OPEN": 1, "CLOSED": 2}


def task_pr(task: dict, prs: dict) -> tuple[int, dict] | None:
    """PR-ul taskului: după număr, altfel după branch (unit > deschis > închis)."""
    if task["pr"] is not None:
        p = prs.get(str(task["pr"]))
        return (task["pr"], p) if p else None
    if task["branch"]:
        found = [(int(n), p) for n, p in prs.items() if p["head"] == task["branch"]]
        if found:
            found.sort(key=lambda np: (_PR_RANK.get(np[1]["state"], 9), -np[0]))
            return found[0]
    return None


def derive(
    tasks: list[dict],
    prs: dict,
    comms: dict,
    branch_active: Callable[[str], bool] = lambda b: False,
) -> dict[str, dict]:
    """Starea fiecărui task. Primul care se potrivește câștigă:
    1. status forțat în tasks.yaml
    2. PR unit                         -> gata
    3. [gata ID] în COMMS              -> gata
    4. [blocat ID ...] în COMMS        -> blocat (dar nu dacă e `de X`, iar X e gata după 1–3)
    5. PR deschis / branch cu commit-uri -> în lucru
    6. toate depends_on gata           -> poate începe
    7. altfel                          -> așteaptă (cu lista exactă)
    """
    # Ce e gata după regulile 1–3 (nu depind de blocaje): un `[blocat X de Y]` cade singur când Y e gata.
    done_early = set()
    for t in tasks:
        found = task_pr(t, prs)
        if (t["status"] == "done" or (t["status"] == "auto" and (
                (found and found[1]["state"] == "MERGED") or comms.get(t["id"], {}).get("done")))):
            done_early.add(t["id"])

    out: dict[str, dict] = {}
    for t in tasks:
        c = comms.get(t["id"], {})
        found = task_pr(t, prs)
        num, pr = found if found else (None, None)
        info: dict = {"status": None, "why": "", "pr": num, "blocked": None}
        # blocat de un task care între timp e gata: blocajul nu mai contează, decid regulile 5–7
        blocked = c.get("blocked") if (c.get("blocked") or {}).get("by") not in done_early else None
        if t["status"] != "auto":
            info["status"], info["why"] = t["status"], "forțat în tasks.yaml"
        elif pr and pr["state"] == "MERGED":
            info["status"], info["why"] = "done", f"PR #{num} unit"
        elif c.get("done"):
            info["status"], info["why"] = "done", "[gata] în COMMS"
        elif blocked:
            info["status"], info["why"] = "blocked", "[blocat] în COMMS"
            info["blocked"] = c["blocked"]
        elif pr and pr["state"] == "OPEN":
            info["status"], info["why"] = "progress", f"PR #{num} deschis"
        elif t["branch"] and branch_active(t["branch"]):
            info["status"], info["why"] = "progress", f"branch `{t['branch']}` are commit-uri"
        out[t["id"]] = info

    done = {tid for tid, i in out.items() if i["status"] == "done"}
    for t in tasks:
        info = out[t["id"]]
        info["waiting_on"] = [d for d in t["depends_on"] if d not in done]
        if info["status"] is None:
            if info["waiting_on"]:
                info["status"] = "wait"
                info["why"] = "așteaptă " + ", ".join(info["waiting_on"])
            else:
                info["status"] = "ready"
                info["why"] = "dependențele sunt gata" if t["depends_on"] else "nu depinde de nimic"
    return out


def longest_chain(tasks: list[dict], statuses: dict) -> list[str]:
    """Cel mai lung lanț de taskuri care nu sunt gata (după număr de taskuri)."""
    by_id = {t["id"]: t for t in tasks}
    best: dict[str, tuple[int, str | None]] = {}

    def walk(tid: str) -> int:
        if tid in best:
            return best[tid][0]
        length, prev = 1, None
        for d in by_id[tid]["depends_on"]:
            if statuses[d]["status"] != "done":
                n = walk(d) + 1
                if n > length:
                    length, prev = n, d
        best[tid] = (length, prev)
        return length

    open_ids = [t["id"] for t in tasks if statuses[t["id"]]["status"] != "done"]
    if not open_ids:
        return []
    end = max(open_ids, key=lambda tid: (walk(tid), -open_ids.index(tid)))
    chain: list[str] = []
    cur: str | None = end
    while cur:
        chain.append(cur)
        cur = best[cur][1]
    return chain[::-1]


# --------------------------------------------------------------------------
# Pasul 3: cursorul și citirea incrementală
# --------------------------------------------------------------------------

def empty_state() -> dict:
    return {"last_sha": None, "last_comms_sha": None, "last_run": None,
            "prs": {}, "comms": {}, "statuses": {}}


def load_state(path: Path) -> dict | None:
    """Cursorul, sau None dacă lipsește ori e stricat (=> rulare completă)."""
    try:
        data = json.loads(Path(path).read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return None
    if not isinstance(data, dict):
        return None
    if not all(isinstance(data.get(k, {}), dict) for k in ("prs", "comms", "statuses")):
        return None
    state = empty_state()
    state.update({k: data.get(k, state[k]) for k in state})
    return state


def dump_state(state: dict) -> str:
    return json.dumps(state, ensure_ascii=False, indent=2, sort_keys=True) + "\n"


def git(root: Path, *args: str) -> subprocess.CompletedProcess:
    return subprocess.run(
        ["git", *args], cwd=root, capture_output=True, text=True,
        encoding="utf-8", errors="replace",
    )


def head_sha(root: Path) -> str | None:
    r = git(root, "rev-parse", "HEAD")
    return r.stdout.strip() if r.returncode == 0 else None


def is_ancestor(root: Path, sha: str, ref: str = "HEAD") -> bool:
    return git(root, "merge-base", "--is-ancestor", sha, ref).returncode == 0


def branch_checker(root: Path) -> Callable[[str], bool]:
    """Are branch-ul (local sau origin/) commit-uri care nu sunt în HEAD?"""
    cache: dict[str, bool] = {}

    def active(branch: str) -> bool:
        if branch not in cache:
            cache[branch] = False
            for ref in (f"refs/remotes/origin/{branch}", f"refs/heads/{branch}"):
                if git(root, "rev-parse", "--verify", "--quiet", ref).returncode == 0:
                    r = git(root, "rev-list", "--count", f"HEAD..{ref}")
                    cache[branch] = r.returncode == 0 and int(r.stdout.strip() or 0) > 0
                    break
        return cache[branch]

    return active


# [blocat A2 de C1] · [blocat A2: motiv] · [blocat A2 de C1: motiv] · [deblocat A2] · [gata A2]
# și mai multe id-uri deodată: [gata A1, B1] · [blocat A2, A3 de C1]
_ID = r"[A-Za-z][\w.-]*"
TAG_RE = re.compile(rf"\[\s*(blocat|deblocat|gata)\s+({_ID}(?:\s*,\s*{_ID})*)\s*([^\]]*)\]", re.IGNORECASE)


def _clean_id(tid: str) -> str:
    """`A2.` sau `A2-` (punctuație lipită de id) -> `A2`."""
    return tid.strip().rstrip(".-")


def parse_tags(line: str) -> list[dict]:
    events = []
    for kind, ids, rest in TAG_RE.findall(line):
        kind = kind.lower()
        by = reason = None
        rest = rest.strip()
        if kind == "blocat" and rest:
            head, _, tail = rest.partition(":")
            if head.strip().lower().startswith("de "):
                by = _clean_id(head.strip()[3:]) or None
                reason = tail
            elif head.strip() and not rest.startswith(":"):
                reason = rest  # text liber fără „de”/„:”
            else:
                reason = tail
            reason = reason.strip() or None
        for tid in (_clean_id(t) for t in ids.split(",")):
            if not tid or tid.lower() == "de":  # „[blocat de X]” fără id: nu știm ce task
                continue
            events.append({"kind": kind, "task": tid, "by": by, "reason": reason})
    return events


COMMS_PATHSPEC = ":(glob)**/*COMMS.md"


def comms_events(root: Path, since_sha: str | None) -> list[dict]:
    """Etichetele din liniile ADĂUGATE în *COMMS.md după `since_sha`,
    în ordinea commit-urilor, cu data commit-ului (pentru „de când”)."""
    rng = f"{since_sha}..HEAD" if since_sha else "HEAD"
    r = git(root, "-c", "core.quotePath=false", "log", "--reverse", "--date-order", "--no-color", "--unified=0",
            "--format=%x00%H %cI", "-p", rng, "--", COMMS_PATHSPEC)
    if r.returncode != 0:
        return []
    events: list[dict] = []
    when = sha = path = None
    for line in r.stdout.splitlines():
        if line.startswith("\x00"):
            sha, _, when = line[1:].partition(" ")
        elif line.startswith("+++ "):
            path = line[6:] if line.startswith("+++ b/") else None
        elif line.startswith("+") and path:
            for ev in parse_tags(line[1:]):
                ev.update(since=when, source=f"{path}@{sha[:7]}")
                events.append(ev)
    return events


# Mesajele `git comms` stau pe un branch separat, `comms`, ca fișiere noi în msgs/<zi>/<id>.md,
# fiecare cu un antet între două rânduri `---` (from, to, type, re…). Citim doar textul de sub antet.
COMMS_REFS = ("refs/remotes/origin/comms", "refs/heads/comms")


def comms_tip(root: Path) -> str | None:
    """Ultimul commit de pe branch-ul `comms` (întâi origin/, apoi cel local), sau None."""
    for ref in COMMS_REFS:
        r = git(root, "rev-parse", "--verify", "--quiet", ref + "^{commit}")
        if r.returncode == 0:
            return r.stdout.strip()
    return None


def comms_msg_events(root: Path, since_sha: str | None, tip: str) -> list[dict]:
    """Etichetele din mesajele adăugate pe `comms` între `since_sha` și `tip`."""
    rng = f"{since_sha}..{tip}" if since_sha else tip
    r = git(root, "-c", "core.quotePath=false", "log", "--reverse", "--date-order", "--no-color", "--unified=0",
            "--diff-filter=A", "--format=%x00%H %cI", "-p", rng, "--", "msgs")
    if r.returncode != 0:
        return []
    events: list[dict] = []
    when = sha = mid = None
    fences = 0  # câte rânduri `---` am văzut în fișierul curent; textul începe după al doilea
    in_header = False  # între `diff --git` și primul `@@`: aici `+++ b/…` e numele fișierului
    for line in r.stdout.splitlines():
        if line.startswith("\x00"):
            sha, _, when = line[1:].partition(" ")
            mid, in_header = None, False
        elif line.startswith("diff --git "):
            mid, in_header = None, True
        elif in_header and line.startswith("+++ "):
            path = line[6:] if line.startswith("+++ b/") else ""
            mid = path.rsplit("/", 1)[-1].removesuffix(".md") if path.endswith(".md") else None
            fences = -1
        elif in_header and line.startswith("@@"):
            in_header = False
        elif in_header:
            continue
        elif line.startswith("+") and mid:
            text = line[1:].rstrip("\r")
            if fences == -1:  # primul rând: are antet sau nu?
                fences = 1 if text.strip() == "---" else 2
                if fences == 1:
                    continue
            elif fences < 2:
                fences += text.strip() == "---"
                continue
            for ev in parse_tags(text):
                ev.update(since=when, source=f"comms:{mid}@{sha[:7]}")
                events.append(ev)
    return events


def _event_time(ev: dict) -> dt.datetime:
    try:
        return dt.datetime.fromisoformat(ev["since"].replace("Z", "+00:00"))
    except (AttributeError, ValueError):
        return dt.datetime.min.replace(tzinfo=dt.timezone.utc)


def apply_comms(comms: dict, events: Iterable[dict], known: set[str]) -> None:
    # id-urile din etichete se potrivesc fără să conteze majusculele: [gata a1] e A1
    canon = {k.lower(): k for k in known}
    for ev in events:
        tid = canon.get(ev["task"].lower(), ev["task"])
        if tid not in known:
            warn(f"eticheta [{ev['kind']} {tid}] din {ev['source']}: taskul nu e în tasks.yaml (o păstrez)")
        c = comms.setdefault(tid, {})
        if ev["kind"] == "blocat":
            c["blocked"] = {k: ev[k] for k in ("by", "reason", "since", "source")}
            if ev["by"]:
                c["blocked"]["by"] = canon.get(ev["by"].lower(), ev["by"])
        elif ev["kind"] == "deblocat":
            c.pop("blocked", None)
        elif ev["kind"] == "gata":
            c["done"] = {"since": ev["since"], "source": ev["source"]}
        if not c:
            comms.pop(tid, None)


def fetch_prs_gh(root: Path, since: str | None) -> list[dict]:
    cmd = ["gh", "pr", "list", "--state", "all", "--limit", "1000",
           "--json", "number,state,headRefName,mergedAt"]
    if since:
        cmd += ["--search", f"updated:>={since}"]
    try:
        r = subprocess.run(cmd, cwd=root, capture_output=True, text=True,
                           encoding="utf-8", errors="replace")
    except FileNotFoundError:
        raise PRFetchError("`gh` nu e instalat") from None
    if r.returncode != 0:
        raise PRFetchError(r.stderr.strip() or f"`gh` a ieșit cu {r.returncode}")
    return json.loads(r.stdout or "[]")


# --------------------------------------------------------------------------
# Pasul 4: desenul
# --------------------------------------------------------------------------

def _node_id(tid: str) -> str:
    return "t_" + re.sub(r"\W", "_", tid)


def _mm_text(s: str) -> str:
    return (s.replace("&", "#amp;").replace('"', "#quot;")
             .replace("<", "#lt;").replace(">", "#gt;"))


def _md_text(s: str) -> str:
    return re.sub(r"([\\`*_\[\]<>|])", r"\\\1", s)


def _when(iso: str | None) -> str:
    if not iso:
        return ""
    try:
        t = dt.datetime.fromisoformat(iso.replace("Z", "+00:00")).astimezone(dt.timezone.utc)
    except ValueError:
        return iso
    return t.strftime("%Y-%m-%d %H:%M UTC")


def node_label(task: dict, info: dict) -> str:
    s = info["status"]
    return f"{_mm_text(task['id'])} · {_mm_text(task['title'])}<br/>{ICON[s]} {LABEL[s]}"


def render_mermaid(tasks: list[dict], statuses: dict) -> str:
    lines = ["flowchart LR"]
    owners: dict[str, list[dict]] = {}
    for t in tasks:
        owners.setdefault(t["owner"], []).append(t)
    for owner in sorted(owners):
        lines.append(f'  subgraph {_node_id("owner_" + owner)}["{_mm_text(owner)}"]')
        for t in owners[owner]:
            lines.append(f'    {_node_id(t["id"])}["{node_label(t, statuses[t["id"]])}"]')
        lines.append("  end")
    for t in tasks:
        for d in t["depends_on"]:
            lines.append(f"  {_node_id(d)} --> {_node_id(t['id'])}")
    for s in STATUSES:
        fill, stroke, color = STYLE[s]
        lines.append(f"  classDef {s} fill:{fill},stroke:{stroke},color:{color},stroke-width:2px")
    for s in STATUSES:
        ids = [_node_id(t["id"]) for t in tasks if statuses[t["id"]]["status"] == s]
        if ids:
            lines.append(f"  class {','.join(ids)} {s}")
    return "\n".join(lines)


def _item(t: dict, extra: str = "") -> str:
    line = f"- **{_md_text(t['id'])}** ({_md_text(t['owner'])}) {_md_text(t['title'])}"
    if extra:
        line += f": {extra}"
    if t["note"]:
        line += f" _({_md_text(t['note'])})_"
    return line


def render_markdown(tasks: list[dict], statuses: dict) -> str:
    count = {s: sum(1 for i in statuses.values() if i["status"] == s) for s in STATUSES}
    by = lambda s: [t for t in tasks if statuses[t["id"]]["status"] == s]  # noqa: E731

    def section(title: str, items: list[str]) -> list[str]:
        return [f"## {title}", "", *(items or ["_nimic_"]), ""]

    blocked_items = []
    for t in by("blocked"):
        b = statuses[t["id"]]["blocked"] or {}
        parts = []
        if b.get("by"):
            parts.append(f"de {_md_text(b['by'])}")
        if b.get("reason"):
            parts.append(_md_text(b["reason"]))
        if b.get("since"):
            parts.append(f"din {_when(b['since'])}")
        if not b:
            parts.append("forțat în tasks.yaml")
        blocked_items.append(_item(t, " · ".join(parts)))

    progress_items = [_item(t, statuses[t["id"]]["why"]) for t in by("progress")]  # text generat de noi
    wait_items = [_item(t, "așteaptă " + ", ".join(statuses[t["id"]]["waiting_on"]) if statuses[t["id"]]["waiting_on"] else "forțat în tasks.yaml") for t in by("wait")]
    chain = longest_chain(tasks, statuses)
    chain_text = (f"{' → '.join(chain)} ({len(chain)} " + ("task" if len(chain) == 1 else "taskuri") + ")") if chain else "_totul e gata_ 🎉"

    legend = ["| Stare | Semn | Culoare |", "|---|---|---|"]
    legend += [f"| {LABEL[s]} | {ICON[s]} | `{STYLE[s][1]}` |" for s in STATUSES]

    out = [
        "# Cine pe cine așteaptă",
        "",
        "> Generat automat de `dag/build_dag.py` din `dag/tasks.yaml`. Nu edita de mână:",
        "> schimbă planul printr-un PR la `dag/tasks.yaml`. Istoricul: `git log -p DAG.md`.",
        "",
        f"**Gata:** {count['done']}/{len(tasks)} · **În lucru:** {count['progress']} · "
        f"**Poate începe:** {count['ready']} · **Așteaptă:** {count['wait']} · **Blocat:** {count['blocked']}",
        "",
        "```mermaid",
        render_mermaid(tasks, statuses),
        "```",
        "",
        *section("Poate începe acum", [_item(t) for t in by("ready")]),
        *section("Blocat", blocked_items),
        *section("În lucru", progress_items),
        *section("Așteaptă", wait_items),
        "## Cel mai lung lanț rămas",
        "",
        chain_text,
        "",
        "## Legendă",
        "",
        *legend,
        "",
    ]
    return "\n".join(out)


# --------------------------------------------------------------------------
# Rularea
# --------------------------------------------------------------------------

def _iso(t: dt.datetime) -> str:
    return t.astimezone(dt.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


# Din ce stări anunțăm trecerea în „poate începe”. Din „în lucru” nu: acolo omul știe deja.
ANNOUNCE_FROM = ("wait", "blocked")


def newly_ready(tasks: list[dict], prev: dict[str, str], statuses: dict) -> list[dict]:
    """Taskurile care tocmai au trecut din „așteaptă”/„blocat” în „poate începe”.
    Un task nou în plan (fără stare anterioară) nu e anunțat; nici prima rulare."""
    out = []
    for t in tasks:
        if statuses[t["id"]]["status"] == "ready" and prev.get(t["id"]) in ANNOUNCE_FROM:
            out.append({
                "id": t["id"], "owner": t["owner"], "title": t["title"],
                "was": prev[t["id"]],
                "deps_done": list(t["depends_on"]),  # „poate începe” => toate sunt gata
            })
    return out


def run(
    root: Path = ROOT,
    *,
    full: bool = False,
    fetch_prs: Callable[[Path, str | None], list[dict]] | None = fetch_prs_gh,
    now: dt.datetime | None = None,
    out: Path | None = None,
    ready_out: Path | None = None,
) -> bool:
    """Un pas complet. Întoarce True dacă a scris ceva (DAG.md sau state.json).

    `out`: unde stau DAG.md și dag/state.json (implicit `root`; în workflow, worktree-ul branch-ului `dag`).
    `ready_out`: dacă e dat, scrie acolo lista JSON a taskurilor care tocmai au devenit „poate începe”."""
    root = Path(root)
    out = Path(out) if out else root
    tasks = load_tasks(root / "dag" / "tasks.yaml")
    state_path, dag_path = out / "dag" / "state.json", out / "DAG.md"
    started = now or dt.datetime.now(dt.timezone.utc)

    saved = load_state(state_path)
    old = None if full else saved
    if not full and old is None and state_path.exists():
        warn("state.json e stricat: fac o rulare completă")
    head = head_sha(root)
    if old and old["last_sha"] and head and not is_ancestor(root, old["last_sha"]):
        warn(f"commit-ul {old['last_sha'][:7]} nu mai e în istoric: fac o rulare completă")
        old = None
    state = copy.deepcopy(old) if old else empty_state()
    # Stările de data trecută se păstrează și la o rulare completă, ca să nu anunțăm de două ori.
    prev_statuses = dict(saved["statuses"]) if saved else {}

    # PR-urile schimbate de la ultima rulare (toate, la rularea completă)
    pr_ok = fetch_prs is not None
    if fetch_prs is not None:
        since = None
        if state["last_run"]:
            try:
                last = dt.datetime.fromisoformat(state["last_run"].replace("Z", "+00:00"))
                since = _iso(last - PR_OVERLAP)
            except ValueError:
                pass
        try:
            merge_prs(state["prs"], fetch_prs(root, since))
        except PRFetchError as e:
            warn(f"nu am putut citi PR-urile ({e}); folosesc ce știam")
            pr_ok = False

    # Etichetele noi: din inbox-urile vechi *COMMS.md și din mesajele de pe branch-ul `comms`,
    # aplicate în ordinea datei commit-ului (sort stabil: la egalitate, întâi inbox-urile).
    events = comms_events(root, state["last_sha"]) if head else []
    tip = comms_tip(root)
    if tip:
        since = state["last_comms_sha"]
        if since and not is_ancestor(root, since, tip):
            warn(f"commit-ul {since[:7]} nu mai e pe branch-ul comms: recitesc tot branch-ul")
            since = None
        events += comms_msg_events(root, since, tip)
    events.sort(key=_event_time)
    apply_comms(state["comms"], events, {t["id"] for t in tasks})

    statuses = derive(tasks, state["prs"], state["comms"],
                      branch_checker(root) if head else (lambda b: False))
    state["statuses"] = {tid: i["status"] for tid, i in statuses.items()}
    ready = newly_ready(tasks, prev_statuses, statuses)
    md = render_markdown(tasks, statuses)

    old_md = dag_path.read_text(encoding="utf-8") if dag_path.exists() else None
    md_changed = old_md != md
    facts_changed = old is None or any(state[k] != old[k] for k in ("prs", "comms", "statuses"))

    if md_changed:
        dag_path.parent.mkdir(parents=True, exist_ok=True)
        dag_path.write_text(md, encoding="utf-8", newline="\n")
    if md_changed or facts_changed:
        # Cursorul avansează doar când s-a schimbat ceva; altfel re-citim același
        # interval data viitoare, ceea ce dă același rezultat (idempotent).
        state["last_sha"] = head
        state["last_comms_sha"] = tip
        if pr_ok:
            state["last_run"] = _iso(started)
        state_path.parent.mkdir(parents=True, exist_ok=True)
        state_path.write_text(dump_state(state), encoding="utf-8", newline="\n")
    if ready_out is not None:
        Path(ready_out).write_text(json.dumps(ready, ensure_ascii=False, indent=2) + "\n",
                                   encoding="utf-8", newline="\n")
    return md_changed or facts_changed


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    ap.add_argument("--full", action="store_true", help="ignoră cursorul și citește tot")
    ap.add_argument("--no-github", action="store_true", help="nu chema `gh` (PR-urile rămân cele știute)")
    ap.add_argument("--root", type=Path, default=ROOT, help="rădăcina repo-ului")
    ap.add_argument("--out", type=Path, default=None,
                    help="unde stau DAG.md și dag/state.json (implicit --root; în workflow, worktree-ul `dag`)")
    ap.add_argument("--ready-out", type=Path, default=None,
                    help="scrie aici lista JSON a taskurilor care tocmai au devenit „poate începe”")
    args = ap.parse_args(argv)
    for stream in (sys.stdout, sys.stderr):
        try:
            stream.reconfigure(encoding="utf-8")
        except AttributeError:
            pass
    try:
        changed = run(args.root, full=args.full, fetch_prs=None if args.no_github else fetch_prs_gh,
                      out=args.out, ready_out=args.ready_out)
    except PlanError as e:
        print(f"[dag] EROARE în plan: {e}", file=sys.stderr)
        return 2
    print("[dag] DAG.md actualizat" if changed else "[dag] nimic nou")
    return 0


if __name__ == "__main__":
    sys.exit(main())
