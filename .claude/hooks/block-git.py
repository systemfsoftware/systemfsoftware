#!/usr/bin/env python3
"""PreToolUse hook for Claude Code: block direct `git` CLI usage.

Reads a Claude Code hook payload from stdin (JSON with `tool_name` and
`tool_input.command`), and exits 2 with a helpful stderr message when the
Bash tool was invoked to run `git` directly. `jj` (and `jj git push`,
`jj git fetch`, etc.) and non-Bash tools pass through with exit 0.

Detection is token-based. Quoted strings are blanked out so `echo "git
status"` never matches. Shell wrappers (`bash -c`, `sh -c`, …) are
unwrapped so the inner command is also scanned.

  Blocked (exit 2):
    git status
    git add .
    git commit -m "..."
    git push origin main
    bash -c "git status"
    sh -c 'git log'
    git status && git add .

  Allowed (exit 0):
    jj st
    jj git push                          # `git` is an argument to `jj`,
                                        # not a fresh command (no shell
                                        # command-delimiter precedes it)
    cat .git/config
    echo "git status"                    # `git` is inside quotes
    github, digital, legit               # `git` is a prefix, not a token
    git-credential-manager               # `git` is part of a longer token
"""

from __future__ import annotations

import json
import re
import shlex
import sys
from typing import Final

# A standalone `git` token is a top-level command only when it appears at
# the very start of a (quote-blanked) fragment OR after a shell
# command-delimiter (`;`, `|`, `&`, `(`, or newline), optionally followed by
# whitespace. Plain whitespace is NOT enough — `jj git push` has `git`
# separated from `jj` by a space, but there `git` is an argument to `jj`, not
# a fresh command. On the right, `git` must NOT be glued to an identifier
# character so `github`, `digital`, `legit`, and `git-credential-manager`
# don't match.
_GIT_TOKEN_RE: Final[re.Pattern[str]] = re.compile(
    r"(?:^|[;|&()\n])\s*git(?![A-Za-z0-9_\-])"
)

# Tokens that act as shell wrappers taking a `-c <command>` argument.
_WRAPPER_PREFIXES: Final[frozenset[str]] = frozenset(
    {"bash", "sh", "zsh", "ksh", "dash", "ash", "fish", "busybox"}
)


def _strip_quoted_strings(command: str) -> str:
    """Replace the contents of quoted strings with spaces.

    Keeps the surrounding quote characters so token positions are preserved,
    but blanks out everything between them. Backslash escapes inside double
    quotes are also blanked. This is intentionally looser than a full shell
    parser — we just need to neutralise `echo "git …"`.
    """
    out: list[str] = []
    i = 0
    n = len(command)
    while i < n:
        ch = command[i]
        if ch in ("'", '"'):
            quote = ch
            out.append(ch)
            i += 1
            while i < n and command[i] != quote:
                if command[i] == "\\" and i + 1 < n:
                    out.append(" ")
                    out.append(" ")
                    i += 2
                else:
                    out.append(" ")
                    i += 1
            if i < n:
                out.append(quote)
                i += 1
        elif ch == "\\" and i + 1 < n:
            out.append(" ")
            out.append(" ")
            i += 2
        else:
            out.append(ch)
            i += 1
    return "".join(out)


def _contains_git_top_level(command: str) -> bool:
    """True if `command` (with quoted strings blanked) contains `git …`."""
    return _GIT_TOKEN_RE.search(_strip_quoted_strings(command)) is not None


def _collect_wrapper_payloads(command: str) -> list[str]:
    """Extract inner commands from `bash -c "…"` / `sh -c '…'` wrappers.

    Returns the inner command strings, preserving their original quoting so
    that `_contains_git_top_level` (which blanks quoted regions) works on
    each one.
    """
    payloads: list[str] = []
    try:
        tokens = shlex.split(command, posix=True)
    except ValueError:
        return payloads

    i = 0
    while i < len(tokens):
        token = tokens[i]
        if (
            token in _WRAPPER_PREFIXES
            and i + 1 < len(tokens)
            and tokens[i + 1] in {"-c", "--command"}
            and i + 2 < len(tokens)
        ):
            payloads.append(tokens[i + 2])
            i += 3
            continue
        i += 1
    return payloads


def contains_direct_git(command: str) -> bool:
    """True if `command` directly invokes the `git` CLI."""
    if _contains_git_top_level(command):
        return True
    for inner in _collect_wrapper_payloads(command):
        if _contains_git_top_level(inner):
            return True
    return False


_BLOCK_MESSAGE = """\
Direct `git` CLI usage is blocked in this repository. The repo uses
[Jujutsu](https://github.com/martinvonz/jj) (jj) colocated with git; the
PreToolUse hook redirects you to `jj` so working-copy state stays consistent.

Common mappings:

  git status       -> jj st
  git diff         -> jj diff --git
  git log          -> jj log
  git add/commit   -> describe the change, then `jj commit`
  git branch       -> jj bookmark
  git push         -> jj git push
  git fetch        -> jj git fetch

Full workflow and the bypass list: .claude/skills/jj-workflow/SKILL.md
"""


def main() -> int:
    try:
        payload = json.load(sys.stdin)
    except json.JSONDecodeError:
        # Malformed payload — don't block; let Claude Code surface its own error.
        return 0

    if payload.get("tool_name") != "Bash":
        return 0

    tool_input = payload.get("tool_input") or {}
    command = tool_input.get("command")
    if not isinstance(command, str) or not command:
        return 0

    if contains_direct_git(command):
        sys.stderr.write(_BLOCK_MESSAGE)
        sys.stderr.flush()
        return 2

    return 0


if __name__ == "__main__":
    sys.exit(main())