# AGENTS.md — systemfsoftware monorepo

Effect-TS libraries + the oxlint plugin enforcing the constitution (at `repos/constitution/`; amend upstream, never vendored copy). Root holds workspace invariants; leaf packages carry deltas.

## Safety

```yaml
- id: S1
  title: NEVER enable isolatedDeclarations
  do: keep isolatedDeclarations disabled in every tsconfig
  dont: enable isolatedDeclarations anywhere
  harm: 153 compile errors in idiomatic Effect
  check: no tsconfig has isolatedDeclarations: true

- id: S2
  title: NEVER modify minimumReleaseAgeExclude
  do: pin younger deps tighter (e.g. ~0.22.9) or wait for the 24h cutoff
  dont: modify minimumReleaseAgeExclude in pnpm-workspace.yaml
  harm: supply-chain policy violation
  check: pnpm-workspace.yaml minimumReleaseAgeExclude is unmodified

- id: S3
  title: Vendored repos are read-only
  do: amend upstream
  dont: edit repos/constitution/, repos/effect/, repos/typescript-go/
  harm: vendored copies diverge from upstream
  check: no file in repos/ is modified

- id: S4
  title: Never hand-edit package.json#exports on tsdown packages
  do: change tsdown.config.ts
  dont: edit package.json#exports or publishConfig.exports directly
  harm: exports drift from build output
  check: exports changes come from tsdown.config.ts only
```

## Stack

| Concern  | Tool                                   | Note                                                              |
| -------- | -------------------------------------- | ----------------------------------------------------------------- |
| Pkg mgr  | pnpm                                   | `pnpm --filter <pkg> <cmd>` from root; **never** `cd`. No `npx`.  |
| Types    | tsc + api-extractor                    | `pnpm api:check` runs for every package with `api-extractor.json` |
| Build    | tsdown + turbo                         | ESM (`.mjs` + tsc dts). Build via `pnpm turbo build`.             |
| Tests    | Vitest + `@effect/vitest` + fast-check | PBT on pure core; composition through I/O sandwich.               |
| Mutation | Stryker (typescript-checker)           | Targets pure-core files.                                          |
| Lint     | oxlint (self-hosted) + dprint          | Self-hosted: `@systemfsoftware/oxlint-plugin` lints itself.       |

## Surface Classes

| Surface              | Examples                                                                                               | Rule                                                                                                                                                                                                                                                                                      |
| -------------------- | ------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Locked**           | `AGENTS.md`, `repos/`, `.github/workflows/`, evaluation scripts                                        | Read and propose changes, but do not edit to make verification pass.                                                                                                                                                                                                                      |
| **Editable**         | `packages/*/`, `scripts/`, `docs/solutions/`, `tsdown.config.ts`, `dprint.json`, `pnpm-workspace.yaml` | Edit freely within the active task. `docs/solutions/` holds documented solutions to past problems (bugs, best practices, workflow patterns), organized by category with YAML frontmatter (`module`, `tags`, `problem_type`); relevant when implementing or debugging in documented areas. |
| **Human-controlled** | Merge to `main`, publish, deploy, destructive ops, credentials                                         | Ask the user before acting.                                                                                                                                                                                                                                                               |

## Startup Workflow

Before writing code:

1. **Confirm working directory** with `pwd` — must be the monorepo root.
2. **Read this file** completely.
3. **Confirm the leaf instruction hierarchy is loaded** — the runtime auto-loads root + every leaf `AGENTS.md` on the path down to `cwd`. Content accumulates downward; leaves only carry their directory's delta.
4. **Run baseline verification:**
   ```bash
   pnpm check  # install --frozen-lockfile → lint + typecheck + test
   ```
5. **Confirm the active task** with the user or via the task list.
6. **Review recent commits** with `jj log --no-graph -5`.

If baseline verification fails, repair it first before adding new scope.

## Working Rules

```yaml
- id: W1
  title: One task at a time
  do: finish current task before starting another
  dont: context-switch
  harm: partial completion across tasks = no verifiable deliverable
  check: todo list has exactly one active task

- id: W2
  title: Stay in scope
  do: modify only files related to the current task
  dont: add retries, validation, telemetry, or refactors unasked
  harm: untested scope creep
  check: changed files match task scope

- id: W3
  title: Record state to runtime memory
  do: save decisions, bugs, conventions to memory; track active work in task list
  dont: rely on file trackers
  harm: next session loses context
  check: memory and task list are current before yielding
```

## Definition of Done

```yaml
- id: D1
  title: Done means
  do: implement target behavior; run full verification after last edit; record evidence; leave repo restartable
  dont: claim done with failing checks, stale evidence, or uncommitted state
  harm: undone work passes as done
  check: pnpm check exits 0 from this session after the last edit
```

## Verification Commands

Run in order before claiming done:

```bash
pnpm check  # install --frozen-lockfile → lint + typecheck + test + api:check (concurrent, via turbo)
```

Then `pnpm --filter <pkg> mutation` — **100%** on changed pure-core files. Any failure blocks done. Never delete the per-package Stryker incremental baseline (each package writes its own reports/stryker-incremental.json).

### Anti-Bypass

```yaml
- id: A1
  title: Run the full command
  do: run exactly pnpm check
  dont: run individual steps, --skip, --grep, or --no-verify
  harm: partial verification masks failures
  check: no filter flags in command

- id: A2
  title: Current-run evidence only
  do: use output from this session after last edit
  dont: reference CI or prior session output
  harm: stale evidence hides regressions
  check: evidence timestamp is after last edit

- id: A3
  title: Any failure blocks done
  do: resolve every failure before claiming done
  dont: claim done with red checks even if "unrelated"
  harm: unrelated failures become related after deploy
  check: every verification command exits 0
```

### Hallucination Prevention

```yaml
- id: H1
  title: Search before write, read before edit, verify before claim
  do: read current source for library APIs; read target file in this session before editing; run verification before claiming done
  dont: write from training memory; edit from memory; claim without evidence
  harm: stale or hallucinated code; unverified claims
  check: every edit preceded by a read; every done claim has current verification output
```

## Instruction Hierarchy

This root file holds workspace-wide invariants only. Directories with distinct build, toolchain, ownership, or risk boundaries get their own leaf `AGENTS.md` delta.

- A leaf delta exists where a directory has different verification commands, a different toolchain, a different ownership (vendored, forked, generated), or a different risk class.
- A rule lives in **exactly ONE file:** the highest level it applies to. Leaves carry only the delta and point back here; they never restate the root.
- If a rule in this file applies to exactly one directory, move it to that directory's leaf.

Leaf `AGENTS.md` lives wherever a directory has distinct checks or constraints. Discover via `glob packages/*/AGENTS.md` and `glob packages/stryker-js/*/AGENTS.md`. Vendored exception: `repos/constitution/` — read-only, changes go upstream.

## Commits

```yaml
- id: C1
  title: Commit format
  do: use `type(scope): subject ≤72 chars`
    dont: use wrong type or omit scope
    harm: release tooling and changelog rely on conventional commits
    check: commitlint passes

- id: C2
  title: Commit types
  do: use feat/fix/chore/build/ci/deps/docs/perf/refactor/revert/style/test
  dont: use feat/fix for config-only changes
  harm: wrong version bumps and changelog categories
  check: type matches diff shape

- id: C3
  title: No AI co-author trailers
  do: sign commits as the human author
  dont: add Co-authored-by or AI attribution
  harm: attribution pollution
  check: commit has no AI trailers
```

## Human Approval

```yaml
- id: P1
  title: Ask before controlled actions
  do: request approval for merge to main, publish, deploy, destructive ops, credentials
  dont: proceed without explicit approval
  harm: automated destructive or credential-exposing actions
  check: every controlled action preceded by user approval
```

## Multi-Agent Ownership

```yaml
- id: M1
  title: Disjoint ownership
  do: each agent owns a disjoint file/module set
  dont: edit files another agent owns without coordination
  harm: merge conflicts and contradictory changes
  check: claimed files are unique per agent

- id: M2
  title: Root verification gates done
  do: ensure root-level `pnpm check` passes before any agent claims done
  dont: claim done with a red tree
  harm: subsystem failure becomes global failure
  check: pnpm check exits 0
```

## Escalation

```yaml
- id: E1
  title: When stuck
  do: consult ARCHITECTURE.md/CONSTITUTION.md for architecture; check project docs for requirements; flag repeated failures for human review; re-read this file for scope ambiguity
  dont: guess; bypass checks; edit vendored code
  harm: wrong deliverable; masked failures; vendored drift
```

## End of Session

```yaml
- id: X1
  title: Save state before ending
  do: record decisions, blockers, next steps to memory; commit safe state
  dont: end with uncommitted work or unrecorded decisions
  harm: next session loses context
  check: working tree clean; memory and task list current
```
