---
title: Worktree creation cost is the checkout, and three cache seeds were failing silently
date: "2026-08-10"
last_updated: "2026-08-10"
category: performance-issues
module: systemfsoftware
problem_type: performance_issue
component: tooling
symptoms:
  - "`wt switch --create <name>` blocks the interactive shell for roughly 85 s"
  - "A post-start log line reads `copy-codegraph: index warm-started (reflink copy)` on a filesystem with no reflink support"
  - "A worktree's `.codegraph/codegraph.db` is 0 bytes and every later creation reports the index as already present"
  - "Every new worktree receives a 192 MB `.turbo` directory that no turbo invocation ever reads"
  - "Removing `.turbo` from `.worktreeinclude` on a feature branch changes nothing for worktrees created from that branch"
root_cause: config_error
resolution_type: config_change
severity: medium
related_components:
  - .config/wt.toml
  - .worktreeinclude
  - scripts/worktrunk/copy-codegraph.sh
  - scripts/worktrunk/install-deps.sh
  - scripts/worktrunk/generate-artifacts.sh
tags:
  - worktrunk
  - git-worktree
  - virtiofs
  - turbo
  - build-cache
  - sqlite
  - hooks
---

# Worktree creation cost is the checkout, and three cache seeds were failing silently

## The measured shape

`wt switch --create` was assumed to be slow because of its hook chain. It is not.

| Arm          | Runs | Median     | p90    |
| ------------ | ---- | ---------- | ------ |
| Full hooks   | 5    | **85.7 s** | 89.5 s |
| `--no-hooks` | 5    | **84.7 s** | 88.9 s |

A 1 s difference inside a run-to-run spread of roughly 14 s. The hooks are not
the blocked cost — the `git worktree add` checkout is, at 33,772 files and
967 MiB.

Of those tracked files, **31,846 (94%) are vendored under `repos/`**. The
filesystem is a virtio-fs share (`findmnt -T . -o FSTYPE` reports `virtiofs`),
where `stat` costs about 700 us/file against 1.8 us/file on the VM's local disk.
Cost therefore tracks file count, not bytes: a 581 MB single-file `cp` on the
same mount takes 0.29 s, while the 33,772-file checkout takes ~84 s.

Excluding `repos/` with a sparse checkout brings creation to 9.4 s with 1,942
files. That is not available here — git's own documentation states sparse
checkout requires `--no-checkout` at `git worktree add` time and that
`core.sparseCheckout` "should not be shared" across worktrees, so `wt switch
--create` cannot produce it without worktrunk support. Recorded as the ceiling,
not as a change.

## Defect 1 — `.turbo` was copied and never read

`.worktreeinclude` listed `.turbo` and `.turbo/**`, copying 192 MB / 31,309
files into every worktree.

Turborepo v2.10.5 detects a linked worktree and resolves the filesystem cache to
the **primary** worktree's `.turbo/cache`
(`crates/turborepo-config/src/lib.rs:536-547`, returning `is_shared_worktree:
true`). Only an explicit `cacheDir` in `turbo.json`, `--cache-dir`, or
`TURBO_CACHE_DIR` overrides it (`lib.rs:499-505`); this repo sets none.

Verified behaviourally: with a worktree's local `.turbo/cache` moved aside
entirely, `pnpm exec turbo run build --filter=@systemfsoftware/hex-schema`
reported `29 cached, 29 total`, `FULL TURBO`, and printed "using shared worktree
cache". Worktrees were never cold. The entry is removed.

## Defect 2 — the codegraph seed ran in the blocking phase

`copy-codegraph.sh` sat in `pre-start`, which blocks the shell, although nothing
downstream reads the index — the daemon picks it up whenever it lands. Moved to
`post-start`. The saving is ~0.3 s, below the noise floor; the move is correct by
placement, not measurable as a speed-up.

## Defect 3 — the copy lied about what it did, then poisoned its own guard

The script tried `sqlite3 .backup` and fell back to `cp --reflink=auto`.

On this mount `sqlite3` cannot open the database at all. SQLite's WAL index
requires a `MAP_SHARED` mmap that virtio-fs and 9p do not honour; the repro in
the filesystem-and-SQLite diagnostic returns `disk I/O error` (522,
`SQLITE_IOERR_SHORT_READ`) on the shared mount while the same repro passes on
local `/tmp`. Timed: `sqlite3 .backup` fails in 0.15 s, `cp --reflink=always`
fails in 0.05 s, plain `cp` of 581 MB succeeds in 0.29 s.

Two consequences, both silent:

1. `--reflink=auto` degraded to a full 581 MB read and write while the script
   printed `index warm-started (reflink copy)`. The log actively misled.
2. The failed `sqlite3 .backup` left a **0-byte** destination file. The next
   run's `[[ -f "$DST_DB" ]]` guard read that as a valid index and skipped
   warm-start permanently.

The script now uses `--reflink=always` so the degrade is observable, names the
mechanism that actually ran, guards on `-s` rather than `-f`, and writes through
a temp name renamed into place.

## Defect 4 — the include list is read from the source worktree

`wt step copy-ignored --help`: `--from` "Defaults to main worktree." The
`.worktreeinclude` that governs is the **source** worktree's copy, not the one in
the worktree being created.

Proven with two dry runs against the same destination:

| `--from`                                                  | `.turbo` entries |
| --------------------------------------------------------- | ---------------- |
| `feat/interface-doctrine-daemon` (main worktree, unfixed) | **51**           |
| `worktrees-startup-time-debug` (fixed)                    | **0**            |

So this commit's `.worktreeinclude` change takes effect for new worktrees only
once the main worktree's checkout carries it. Until then the fix is committed,
correct, and inert. A caveat recording this now sits at the top of
`.worktreeinclude`.

## Prevention

- Measure both arms before moving a hook. A difference smaller than the spread is
  not a result.
- Rank phases by file count, not by megabytes, on any shared or networked mount.
- Before adding a cache to the seeding list, move the destination copy aside and
  re-run the tool; keep the entry only if that produces a miss.
- Never `cp --reflink=auto` in a script that reports what it did.
- Guard "already seeded" on `-s`, never `-f`, and stage copies through a temp
  name.

## Related

- `turbo-cache-never-warm.md` — the input-hash side of turbo caching; disjoint
  from this file, which is about cache directory location.
- `turbo-cache-requires-complete-input-hash.md` — records the linked-worktree
  redirect as prior art.
