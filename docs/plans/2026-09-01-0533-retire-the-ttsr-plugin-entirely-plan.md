# Plan — Retire the TTSR plugin entirely (supersedes 2026-09-01-0454)

```yaml
plan:
  id: unified-ce-unified-plan/v1
  status: implementation-ready
  created: 2026-09-01-05:33
  supersedes: docs/plans/2026-09-01-0454-refactor-restore-single-constitution-plan.md
  delivery: one branch (restore-single-document), one PR (#21), own commits
```

## Problem

The 0454 plan kept the plugin alive in reduced form: three rule files as
"residency statements" and `constitution-conduct-review.md` as the one active
interrupt. The user rejected that on first principles: **the constitution is
always on, so every plugin rule is useless.** The plugin's entire function was
to carry law into the agent's context on a trigger; residency (`@CONSTITUTION.md`)
already delivers all of it, always. The conduct-review interrupt is the clearest
case — its body restates `CONST-G3`, `CONST-W3`, `CONST-S1`, `CONST-S4`,
`CONST-S2`, every one of them resident in `CONSTITUTION.md` the moment the
trigger fires. The interrupt injects text the agent already has.

This is CONST-S4 turned on the restore itself: the statement files were a
helper added where removal does the job.

## Requirements

- **R1 — The plugin is gone.** `plugins/` (constitution README, all four rule
  files, `.omp-plugin/`, `.claude-plugin/`) is deleted. No manifest, no
  statement file, no tombstone README survives (DEL1: remove means remove).
- **R2 — The repo teaches one delivery path.** `README.md` quick start drops
  the marketplace/install step; `@CONSTITUTION.md` is the only wiring.
  `AGENTS.md` drops "agent harness" from the tooling description.
- **R3 — The ttsr learning is marked historical.** Its subject corpus (the
  constitution plugin's condition regexes) no longer exists; the two
  transferable traps (PCRE flag translation, backreference tautology matching)
  stay for any future TTSR plugin.
- **R4 — Clean cutover.** No live surface references the plugin or any rule
  file name: `git grep -nI -e 'plugins/constitution' -e 'constitution-conduct-review'
  -e 'constitution-pure-core' -e 'constitution-boundary'
  -e 'constitution-verification' -- . ':!docs/plans'` prints zero lines.
  (Plan documents are the named exception; this one included.)

## Implementation units

- **U1 — Plan supersession** (this document): write, delete 0454,
  commit `docs(plans)`.
- **U2 — Plugin removal**: `git rm -r plugins/`; README step 2 removed;
  AGENTS.md tooling line corrected. One commit.
- **U3 — Learning annotation**: ttsr doc Context paragraph noting the plugin's
  removal and why, lesson kept as transferable. Rides U2's commit — same
  cutover, one reviewable unit.
- **U4 — Verification battery**: `deno task test` (gate reads only
  `CONSTITUTION.md`; unaffected, must stay green); `deno lint`; the R4 sweep;
  `omp plugin doctor` diffed against the pre-deletion baseline (local plugin
  state lives under `/root/.omp/plugins` — repo deletion must not change the
  doctor verdict shape; stale local links are machine state, out of repo scope).

## Verification Contract

| # | Check | Command | Expected |
|---|---|---|---|
| 1 | corpus gate | `deno task test` | `valid: 40 rules across 6 yaml blocks in 1 files, 9 families`, exit 0 |
| 2 | lint | `deno lint` | clean |
| 3 | DEL1 sweep | git grep per R4 | zero lines, read stdout |
| 4 | loader state | `omp plugin doctor` | same summary shape as baseline (5 ok / 1 warn / 1 pre-existing error); no new error introduced by the repo deletion |
| 5 | clean tree | `git status --porcelain` | empty |

## Key technical decisions

```yaml
- id: KTD1
  decision: Delete the plugin entirely rather than keep a zero-rule shell.
  why: A plugin directory with no rules and a README that says "this plugin
    does nothing, residency delivers the law" is a standing tombstone — DEL1's
    named anti-pattern. The git history carries the artifact.
- id: KTD2
  decision: The ttsr learning is annotated, not deleted.
  why: Solutions docs are durable learnings; the flag-translation trap is
    generic TTSR knowledge independent of this plugin's life. Its Context now
    names the plugin as removed so no reader treats the corpus as live.
- id: KTD3
  decision: conduct-review's law needs no replacement interrupt.
  why: Every rule it restates is resident (CONST-G3, W3, S1, S4, S2). A regex
    trigger that injects already-present text is not enforcement, it is noise —
    and its 200-char proximity window misfired on benign severity mentions
    (flagged in review).
```

## Non-goals

- Consumer-repo follow-ups (subtree pulls, local `omp plugin uninstall`):
  machine/consumer state, tracked as follow-ups after merge.
- Gate hardening (issues #19, #20) — already filed, unchanged.

## Work relationships

None — terminal correction to the restore PR.
