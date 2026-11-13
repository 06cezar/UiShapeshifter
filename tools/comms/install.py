#!/usr/bin/env python3
"""Instalează comms în clona curentă. Se rulează o dată pe fiecare calculator, din repo:

    python tools/comms/install.py <numele tău>          (de exemplu: D)

Ce face: branch-ul orfan `comms`, worktree-ul `.comms/`, aliasul `git comms`, numele tău în git config,
apoi hook-urile din `.claude/settings.json`, blocul din `CLAUDE.md` și `.comms/` în `.gitignore`.
A doua rulare nu strică nimic: doar actualizează unealta.
"""
import json
import os
import re
import shutil
import subprocess
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import comms                                   # noqa: E402
from comms import Fail, git                    # noqa: E402

BLOCK, HOOKS = "claude-block.md", "settings.example.json"
KIT = ("comms.py", "install.py", "PROTOCOL.md", BLOCK, HOOKS, "GHID-AGENT.md", "CLAUDE.local.example.md",
       "dag-trigger.example.yml")
START, END = "<!-- comms:start -->", "<!-- comms:end -->"
NO_HOOKS = ("- Dacă nu vezi singur rânduri `[comms]` la începutul unui prompt, agentul tău nu are hook-urile: rulează "
            "`git comms brief` la început de sesiune și `git comms inbox --new` înainte de fiecare răspuns.\n")


def raw(args, data=b"", env=None):
    r = subprocess.run(("git",) + args, input=data, capture_output=True, env=env or comms.ENV)
    if r.returncode:
        raise Fail("git %s: %s" % (" ".join(args), r.stderr.decode("utf-8", "replace").strip()))
    return r.stdout.decode().strip()


def root_commit():
    """Primul commit de pe `comms`. E identic bit cu bit pe orice calculator (aceleași fișiere, autor și dată),
    deci doi oameni care instalează în același timp pornesc din aceeași istorie, nu din două."""
    files = ((".gitattributes", b"* -text\n"), (".gitignore", b"log.md\n"))
    tree = raw(("mktree",), b"".join(b"100644 blob %s\t%s\n" % (raw(("hash-object", "-w", "--stdin"), data).encode(),
                                                                name.encode()) for name, data in files))
    who = {"NAME": "comms", "EMAIL": "comms@local", "DATE": "1767225600 +0000"}
    env = dict(comms.ENV, **{"GIT_%s_%s" % (role, k): v for role in ("AUTHOR", "COMMITTER") for k, v in who.items()})
    return raw(("-c", "i18n.commitEncoding=UTF-8", "commit-tree", tree, "-m", "comms: init"), env=env)


def quote(path):
    return '"%s"' % re.sub(r'(["$`\\])', r"\\\1", path.replace("\\", "/"))


def read(path):
    try:
        with open(path, encoding="utf-8") as f:
            return f.read()
    except OSError:
        return ""


def write(path, text):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, "w", encoding="utf-8", newline="\n") as f:
        f.write(text)


def project_files(top):
    """Fișierele care se comit în proiect o singură dată, de către primul care instalează."""
    changed = []
    kit = os.path.join(top, "tools", "comms")
    if os.path.normcase(os.path.realpath(HERE)) != os.path.normcase(os.path.realpath(kit)):
        os.makedirs(kit, exist_ok=True)
        for name in KIT:
            if read(os.path.join(HERE, name)) != read(os.path.join(kit, name)):
                shutil.copyfile(os.path.join(HERE, name), os.path.join(kit, name))
                changed.append("tools/comms/" + name)

    ignore = read(os.path.join(top, ".gitignore"))
    if ".comms/" not in ignore.split():
        write(os.path.join(top, ".gitignore"), ignore + ("" if ignore.endswith("\n") or not ignore else "\n") + ".comms/\n")
        changed.append(".gitignore")

    block = read(os.path.join(HERE, BLOCK)).strip()
    for name, extra in (("CLAUDE.md", ""), ("AGENTS.md", NO_HOOKS)):     # AGENTS.md: Codex, Cursor și alți agenți
        text = block.replace(END, extra + END)
        rules = read(os.path.join(top, name))
        if START in rules and END in rules:                # blocul există: îl aducem la zi
            new = re.sub(re.escape(START) + ".*?" + re.escape(END), lambda _: text, rules, flags=re.S)
        else:
            new = rules + ("\n" if rules else "") + text + "\n"
        if new != rules:
            write(os.path.join(top, name), new)
            changed.append(name)

    path = os.path.join(top, ".claude", "settings.json")
    try:
        settings = json.loads(read(path) or "{}")
    except ValueError:
        print("[comms] nu pot citi .claude/settings.json: copiază de mână hook-urile din tools/comms/" + HOOKS)
        return changed
    before = json.dumps(settings, sort_keys=True)
    example = json.loads(read(os.path.join(HERE, HOOKS)))
    for event, entries in example["hooks"].items():
        have = settings.setdefault("hooks", {}).setdefault(event, [])
        if "git comms" not in json.dumps(have):
            have.extend(entries)
    allow = settings.setdefault("permissions", {}).setdefault("allow", [])
    allow.extend(rule for rule in example["permissions"]["allow"] if rule not in allow)
    if json.dumps(settings, sort_keys=True) != before:
        write(path, json.dumps(settings, indent=2, ensure_ascii=False) + "\n")
        changed.append(".claude/settings.json")
    return changed


def main():
    for stream in (sys.stdout, sys.stderr):
        stream.reconfigure(encoding="utf-8", errors="replace")
    if len(sys.argv) != 2 or not re.fullmatch(r"[A-Za-z0-9_]{1,20}", sys.argv[1]) or sys.argv[1] == "all":
        sys.exit("folosire: python tools/comms/install.py <numele tău>     (litere și cifre, de exemplu D)")
    me = sys.argv[1]
    try:
        worktrees = git("worktree", "list", "--porcelain").stdout.splitlines()
        main_top = worktrees[0][len("worktree "):]
        top = git("rev-parse", "--show-toplevel").stdout.strip()
        state = os.path.join(os.path.abspath(git("rev-parse", "--git-common-dir").stdout.strip()), "comms")
        os.makedirs(state, exist_ok=True)

        # 1. branch-ul orfan și worktree-ul; branch-ul de lucru rămâne neatins
        if not git("rev-parse", "--verify", "-q", "refs/heads/comms", check=False).stdout.strip():
            git("branch", "--no-track", "comms", root_commit())
        if "branch refs/heads/comms" not in worktrees:
            git("worktree", "add", os.path.join(main_top, ".comms"), "comms")

        # 2. unealta stă în .git/comms/, ca să meargă pe orice branch ai fi
        tool = os.path.join(state, "comms.py")
        shutil.copyfile(os.path.join(HERE, "comms.py"), tool)
        python = getattr(sys, "_base_executable", None) or sys.executable
        git("config", "alias.comms", "!MSYS_NO_PATHCONV=1 %s %s" % (quote(python), quote(tool)))
        git("config", "comms.me", me)

        # 3. fișierele proiectului
        changed = project_files(top)

        # 4. adu mesajele existente și înscrie-te ca membru
        c = comms.Ctx(me)
        with comms.Lock(c):
            online = comms.sync(c)
            if not os.path.exists(os.path.join(c.wt, "members", me)):
                write(os.path.join(c.wt, "members", me), me + "\n")
                git("add", "--", "members/" + me, cwd=c.wt)
                git(*c.ident(), "-c", "commit.gpgsign=false", "commit", "--quiet", "--no-verify",
                    "-m", "comms: member " + me, cwd=c.wt)
                online = comms.sync(c)
            if not os.path.exists(c.cursor):
                comms.set_cursor(c)            # tot ce sosește de acum înainte e „nou”, inclusiv răspunsurile
    except Fail as e:
        sys.exit("[comms] instalarea a eșuat: %s" % e)
    print("[comms] instalat pentru %s: branch `comms`, worktree %s, comanda `git comms`." % (me, c.wt))
    if changed:
        print("[comms] am schimbat în proiect: %s. Verifică-le și fă commit." % ", ".join(changed))
    if not online:
        print("[comms] remote-ul nu a răspuns: înscrierea ta pleacă la următoarea comandă `git comms`.")


if __name__ == "__main__":
    main()
