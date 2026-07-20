# AGENTS.md — systemfsoftware

Effect-TS libraries + oxlint plugin. `pnpm --filter <pkg> <cmd>` from root; never `cd`. Don't hand-edit `package.json#exports` on tsdown packages — change `tsdown.config.ts`.

## Safety

```yaml
- id: S1
  title: NEVER enable isolatedDeclarations
  do: keep isolatedDeclarations disabled
  dont: enable it in any tsconfig
  harm: 153 compile errors in idiomatic Effect
  check: no tsconfig has isolatedDeclarations: true

- id: S2
  title: NEVER modify minimumReleaseAgeExclude
  do: pin younger deps tighter (~0.22.9)
  dont: modify minimumReleaseAgeExclude in pnpm-workspace.yaml
  harm: supply-chain policy violation
  check: pnpm-workspace.yaml minimumReleaseAgeExclude is unmodified

- id: S3
  title: Vendored repos are read-only
  do: amend upstream
  dont: edit repos/constitution/, repos/effect/, repos/typescript-go/
  harm: vendored copies diverge from upstream
  check: no file in repos/ is modified
```

## Startup

```bash
pnpm check  # install --frozen-lockfile → lint + typecheck + test
```

If it fails, repair before adding scope. Confirm working directory is monorepo root. Read leaf `AGENTS.md` along the path to the working directory.

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
  title: What done means
  do: implement target behavior; run full verification after last edit; record evidence; leave repo restartable
  dont: claim done with failing checks, stale evidence, or uncommitted state
  harm: undone work passes as done
  check: pnpm check exits 0 from this session after the last edit
```

## Verification

```bash
pnpm check  # install --frozen-lockfile → lint + typecheck + test
```

Then `pnpm --filter <pkg> mutation` on changed pure-core files. For `effect-daemon-spec`: `pnpm api:check`. Never delete per-package Stryker incremental baselines.

## Anti-Bypass

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

## Hallucination Prevention

```yaml
- id: H1
  title: Search before write, read before edit, verify before claim
  do: read current source for any library API; read target file in this session before editing; run verification before claiming done
  dont: write from training memory; edit from memory; claim without evidence
  harm: stale or hallucinated code; unverified claims
  check: every edit preceded by a read; every done claim has current verification output
```

## Commits

`type(scope): subject ≤72 chars`. Types: feat/fix/chore/build/ci/deps/docs/perf/refactor/revert/style/test. Scope: package dir or `repo`/`deps`/`release`/`ci`. `feat`/`fix` MUST touch production source. No AI co-author trailers.

## Human Approval

```yaml
- id: P1
  title: Ask before controlled actions
  do: request approval for merge to main, publish, deploy, destructive ops, credentials
  dont: proceed without explicit approval
  harm: automated destructive or credential-exposing actions
  check: every controlled action preceded by user approval
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
