---
title: An unvalidated path interpolated into a seatbelt profile can append its own grants
date: 2026-09-13
category: security-issues
module: nix/comment-checker-sandbox.nix
problem_type: security_issue
component: tooling
severity: high
symptoms:
  - "A working directory named `/tmp/evil\"; (allow file-write* (subpath \"etc\")); \"` renders a seatbelt profile with that rule appended as its own top-level grant"
  - "The rendered profile stays balanced and parses, so nothing fails loudly"
  - "On Linux the same value is inert — `--ro-bind \"$PWD\" \"$PWD\"` passes the path as one argv element — so the defect only exists on the darwin branch"
root_cause: missing_validation
resolution_type: code_fix
tags: [sandbox, seatbelt, sbpl, bubblewrap, nix, injection, path-validation, comment-checker]
---

# An unvalidated path interpolated into a seatbelt profile can append its own grants

## Problem

The macOS branch of `nix/comment-checker-sandbox.nix` builds a seatbelt (SBPL)
profile as text and interpolates the working directory into it:

```sh
profile="$profile
(allow file-read* (subpath \"$PWD\") (subpath \"$(pwd -P)\"))"
```

SBPL has no escape syntax, so a `"` inside the interpolated path closes the
`(subpath "…")` string early and the bytes after it become top-level rules of
the profile. A directory named

```
/tmp/evil"; (allow file-write* (subpath "etc")); "
```

renders a profile that is still balanced, still parses, and now grants writes
to `etc` in addition to the intended read grant. The guard that exists to
restrict the process becomes the mechanism that widens it.

## Symptoms

- The profile built for the hostile directory contains
  `(allow file-write* (subpath "etc"))` as its own rule; an assertion that the
  profile "contains no `file-write*`" does not catch it, because the baseline
  already legitimately writes to `/dev/null` and `/private/tmp`.
- Nothing exits non-zero. `sandbox-exec` accepts the widened profile.
- On Linux the same input is inert: `--ro-bind "$PWD" "$PWD"` passes the path
  as one argv element, so no parser ever sees it as syntax.

## What Didn't Work

- **Relying on `$PWD` being trustworthy.** It comes from `getcwd()` in a healthy
  shell, but any process can set its working directory, and the wrapper inherits
  whatever it is given. The attacker does not need to control the hook — only
  the directory the hook happens to run in.
- **Escaping the quote.** SBPL has no escape sequence for a double quote inside
  a `(subpath "…")` literal, so there is nothing to escape with.
- **Checking the profile for dangerous rules afterwards.** Rule names are
  open-ended (`file-write*`, `mach-lookup`, `process-exec`, …), so the check
  cannot enumerate what it is defending against.

## Solution

Refuse the path before it reaches the profile. A shared guard runs in both
platform branches:

```sh
safe_cwd() {
  case "$1" in
    "" | / | "$HOME") return 1 ;;
    *[!A-Za-z0-9_/.-]*)
      echo "comment-checker: no read access for a working directory outside [A-Za-z0-9_/.-]: $1" >&2
      return 1
      ;;
  esac
  return 0
}
```

The darwin branch appends a rule only for a value the guard accepted, and
appends nothing when none passed:

```sh
cwdRules=""
safe_cwd "$PWD" && cwdRules=" (subpath \"$PWD\")"
real="$(pwd -P)"
[ "$real" != "$PWD" ] && safe_cwd "$real" && cwdRules="$cwdRules (subpath \"$real\")"
profile=$(cat ${seatbelt})
[ -n "$cwdRules" ] && profile="$profile
(allow file-read*$cwdRules)"
```

The `[ -n "$cwdRules" ]` test is load-bearing: appending `(allow file-read*)`
with an empty filter list grants every read, which is a wider hole than the one
being closed.

The Linux branch uses the same guard to decide whether to bind at all, which
also fixes a second defect: an empty `$PWD` used to reach the `*)` arm and hand
bwrap `--ro-bind "" ""`, which bwrap rejects, turning a flagged payload into an
opaque sandbox failure.

## Why This Works

The guard admits only `[A-Za-z0-9_/.-]`, so no character that carries meaning to
the SBPL parser can reach the profile. `/` and `$HOME` are refused for a
different reason — read-only there is the whole filesystem or the whole home
directory — and refusing them costs nothing operational, because the hook reads
its payload on stdin and only needs file access for `--strip` and path-based
lookups. A refused directory still runs the check; it loses file reads and says
so on stderr, which is the channel the model reads.

## Prevention

- **Validate at the boundary, never escape at the point of use.** Treat every
  value interpolated into a policy, template, or generated config as untrusted,
  and reject it by character set before interpolation — escaping needs a syntax
  that a hostile value cannot express, and not every policy language has one.
  `check: review` — the reviewer confirms each value that reaches a generated
  policy is validated in the wrapper, not escaped at the interpolation site.
- **Drive the builder with a hostile value, not a plausible one.** The
  reproduction is a directory whose name closes the string and opens a rule:
  run the wrapper from `/tmp/evil"; (allow file-write* (subpath "etc")); "` and
  confirm the refusal on stderr with the check still running (see Verification).
  `check:` that command; a passing build of the wrapper proves nothing here,
  because the widened profile parses.
- **Keep the "no grant" branch reachable and exercised.** A policy that appends
  nothing must stay valid and must not degrade into an allow-everything rule.
  `check: review` — the reviewer confirms the darwin branch guards the append
  with a non-empty test rather than appending an unfiltered rule.

## Verification

Run from a directory whose name holds a `"`, `;` and `(`, the Linux wrapper
prints the refusal on stderr and still runs the check on stdin:

```
comment-checker: no read access for a working directory outside [A-Za-z0-9_/.-]: /tmp/evil"; (allow file-write* (subpath "etc")); "
[check-comments] Skipping: No file path provided
exit=0
```

## Related

- `nix/comment-checker-sandbox.nix` — the wrapper carrying the guard in both
  platform branches
- `nix/comment-checker.nix` — the fixed-output fetch of the binary the sandbox
  runs; `autoPatchelfHook` is what frees the Linux branch from binding
  `/usr`, `/etc` and `/lib`
- The same wrapper mounts no `/proc`: mounting procfs inside a new pid
  namespace is refused on hosts that forbid it, and the hook needs no procfs.
  Recorded in the file's own comment next to the bwrap invocation.
- [`path-mediation-splits-asserted-from-executed.md`](./path-mediation-splits-asserted-from-executed.md)
  — the adjacent boundary defect: a guard whose asserted object and executed
  object differ
