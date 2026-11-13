#!/usr/bin/env python3
"""Anunță prin `git comms` proprietarii taskurilor care tocmai au trecut în „poate începe”.

Rulare (în workflow, după ce DAG.md a ajuns pe branch-ul `dag`):
    python dag/notify_ready.py "$RUNNER_TEMP/ready.json"

Fișierul vine de la `build_dag.py --ready-out`. Fără AI. Un mesaj refuzat (de exemplu
un proprietar care nu e membru comms) e semnalat, dar nu oprește restul.
"""
from __future__ import annotations

import json
import subprocess
import sys
from pathlib import Path
from typing import Callable

LIMIT = 300  # limita de caractere a unui mesaj comms


def message(entry: dict) -> str:
    """Textul mesajului, cel mult LIMIT caractere. Nu conține etichete [gata …]/[blocat …],
    ca anunțul să nu pornească iar graful."""
    tid = entry["id"]
    if entry.get("deps_done"):
        why = ", ".join(entry["deps_done"]) + (" e gata." if len(entry["deps_done"]) == 1 else " sunt gata.")
    elif entry.get("was") == "blocked":
        why = "nu mai e blocat."
    else:
        why = "nu mai așteaptă nimic."
    tail = f": {why} Graful: DAG.md pe branch-ul dag."
    head = f"{tid} poate începe"
    title = (entry.get("title") or "").strip()
    if title and title != tid:
        room = LIMIT - len(head) - len(tail) - len(" ()")
        if room >= 4:
            if len(title) > room:
                title = title[: room - 1].rstrip() + "…"
            head = f"{tid} ({title}) poate începe"
    text = (head + tail).replace("[", "(").replace("]", ")")
    return text[:LIMIT]


def git_comms_send(owner: str, text: str) -> bool:
    r = subprocess.run(["git", "comms", "send", owner, text, "--type", "fyi"],
                       capture_output=True, text=True, encoding="utf-8", errors="replace")
    out = (r.stdout + r.stderr).strip()
    if out:
        print(out)
    return r.returncode == 0


def notify(entries: list[dict], send: Callable[[str, str], bool] = git_comms_send) -> int:
    """Trimite câte un mesaj pe task. Întoarce numărul de mesaje refuzate."""
    failed = 0
    for e in entries:
        if not send(e["owner"], message(e)):
            print(f"[dag] nu am putut anunța {e['owner']} pentru {e['id']}", file=sys.stderr)
            failed += 1
    return failed


def main(argv: list[str] | None = None) -> int:
    argv = sys.argv[1:] if argv is None else argv
    for stream in (sys.stdout, sys.stderr):
        try:
            stream.reconfigure(encoding="utf-8")
        except AttributeError:
            pass
    if len(argv) != 1:
        print("folosire: notify_ready.py <ready.json>", file=sys.stderr)
        return 2
    path = Path(argv[0])
    entries = json.loads(path.read_text(encoding="utf-8")) if path.exists() else []
    if not entries:
        print("[dag] niciun task nou de anunțat")
        return 0
    failed = notify(entries)
    print(f"[dag] anunțate: {len(entries) - failed}/{len(entries)}")
    return 0  # un anunț ratat nu strică graful, care e deja pe branch-ul dag


if __name__ == "__main__":
    sys.exit(main())
