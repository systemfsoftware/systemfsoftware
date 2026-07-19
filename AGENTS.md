# AGENTS.md — systemfsoftware monorepo

Effect-TS libraries + the oxlint plugin enforcing the constitution (at `repos/constitution/`; amend upstream, never vendored copy). Root holds workspace invariants; leaf packages carry deltas.

## Startup Workflow

Before writing code:

1. **Confirm working directory** with `pwd` — must be the monorepo root.
2. **Read this file** completely.
3. **Read the leaf** `AGENTS.md` along the path to your working directory — content accumulates downward.
4. **Run baseline verification** (`pnpm check`) to confirm a healthy tree before adding scope.
5. **Confirm the active task** with the user or via the task list.
6. **Review recent commits** with `jj log --no-graph -5`.

If baseline verification fails, repair it first before adding new scope.

## Working Rules

- **One task at a time:** pick exactly one task; finish it before starting another.
- **Verification required:** do not claim done without running the verification commands and recording evidence from this session.
- **Record evidence via the runtime memory system and task list:** decisions, bugs, conventions → memory; active work → task list.
- **Stay in scope:** do not modify files unrelated to the current task. Scope reduction requires explicit user approval.
- **Leave clean state:** the next session must run verification immediately.

## Surface Classes

| Surface              | Examples                                                                                               | Rule                                                                 |
| -------------------- | ------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------- |
| **Locked**           | `AGENTS.md`, `repos/`, `.husky/_/`, `.github/workflows/`                                               | Read and propose changes, but do not edit to make verification pass. |
| **Editable**         | `packages/*/`, `docs/solutions/`, `scripts/`, `tsdown.config.ts`, `dprint.json`, `pnpm-workspace.yaml` | Edit freely within the active task.                                  |
| **Human-controlled** | Merge to `main`, publish, deploy, credentials, destructive ops (`rm -rf`, force-push)                  | Ask the user before acting.                                          |

There are no append-only files in this repo.

## Stack

| Concern  | Tool                                   | Note                                                             |
| -------- | -------------------------------------- | ---------------------------------------------------------------- |
| Pkg mgr  | pnpm                                   | `pnpm --filter <pkg> <cmd>` from root; **never** `cd`. No `npx`. |
| Types    | tsc                                    | `effect-daemon-spec` additionally runs api-extractor.            |
| Build    | tsdown                                 | ESM (`.mjs` + tsc dts). Build output in `dist/` is gitignored.   |
| Tests    | Vitest + `@effect/vitest` + fast-check | PBT on pure core; composition through I/O sandwich.              |
| Mutation | Stryker (typescript-checker)           | Targets pure-core files.                                         |
| Lint     | oxlint (self-hosted) + dprint          | Self-hosted: `@systemfsoftware/oxlint-plugin` lints itself.      |

## Packages

Published (`"private": false`): effect-gherkin-spec, effect-daemon-spec, oxlint-plugin, effect-schema-law, stryker-plugins, rx-effect, effect-schema-extensions — all as `@systemfsoftware/<name>`. Private: tsconfig, oxlint-config, vitest-config — no `publishConfig`.

🛑 Don't hand-edit `package.json#exports` on tsdown packages — change `tsdown.config.ts`. Dev condition `@systemfsoftware/source`; `default` resolves `dist`. Keep both in sync.

## Instruction Hierarchy

This root file holds workspace-wide invariants only. Directories with distinct build, lifecycle, or risk boundaries get their own leaf `AGENTS.md` delta.

- A leaf delta exists where a directory has different verification commands, a different toolchain, a different ownership (vendored, forked, generated), or a different risk class.
- A rule lives in **exactly ONE file:** the highest level it applies to. Universal → root. Directory-only → leaf. Leaves carry only the delta and point back here; they never restate or contradict the root.
- If a rule in this file applies to exactly one directory, move it to that directory's leaf.

### Directory Map

| Directory                                 | Leaf                                           | Why                                 |
| ----------------------------------------- | ---------------------------------------------- | ----------------------------------- |
| `packages/tsconfig/`                      | yes — 1-liner                                  | Config-only, no build/test.         |
| `packages/vitest-config/`                 | yes — 1-liner                                  | Config-only, no build/test.         |
| `packages/oxlint-config/`                 | yes — 1-liner                                  | Config-only, no build/test.         |
| `packages/oxlint-plugin/`                 | yes — rule template + test fixture conventions | Distinct rule-authoring workflow.   |
| `packages/stryker-js/`                    | no leaf needed — container                     | Leaves exist in subdirectories.     |
| `packages/stryker-js/core/`               | yes — stryker-js-core                          | Forked, minimal-diff constraint.    |
| `packages/stryker-js/typescript-checker/` | yes — ts-checker                               | Fork leaf at subpath.               |
| `packages/effect-schema-law/`             | yes — property law                             | Distinct law-test pipeline.         |
| `packages/rx-effect/`                     | yes — rx bridge                                | Distinct rx interop build.          |
| `packages/effect-schema-extensions/`      | yes — extensions                               | Distinct extensions build.          |
| `repos/constitution/`                     | yes — vendored read-only                       | Vendored; changes go upstream.      |
| `repos/effect/`                           | yes — vendored reference                       | Vendored; consult only, never edit. |
| `repos/typescript-go/`                    | no leaf — pure vendored lock content            | Read-only Microsoft repo; no agent instruction needed.   |
| `docs/solutions/`                         | no leaf needed — content                       | Same build and boundaries as root.  |
| `scripts/`                                | no leaf needed — tool scripts                  | Same build and boundaries as root.  |

## Definition of Done

A task is done only when ALL of the following are true:

- [ ] Target behavior is implemented.
- [ ] Required verification ran and passed in this session.
- [ ] Evidence recorded via the runtime memory system and task list.
- [ ] Repository remains restartable from the standard startup path (`pnpm install && pnpm check`).

## Verification Commands

### One-shot baseline

```bash
pnpm check  # install --frozen-lockfile → lint + typecheck + test (concurrent)
```

Then `pnpm --filter <pkg> mutation` — **100%** on changed pure-core files. For `effect-daemon-spec`: `pnpm api:check`. Any failure blocks done. Never delete the per-package Stryker incremental baseline (each package writes its own reports/stryker-incremental.json).

### Anti-Bypass Rules

- Run the **full one-shot command**, not individual tests or lint steps in isolation.
- Evidence must be from the **current run** in this session, not a prior session or CI output.
- **Any failure blocks done.** Do not claim done while any verification command is red, even if the failure seems unrelated.
- Do not suppress, skip (`--grep`, `--skip`), or disable checks to make verification pass.
- Do not cherry-pick passing tests to claim completion.
- Do not bypass hooks with `--no-verify` — ever.

### Hallucination Prevention

- **Search before write:** before writing code that calls a library API (Effect-TS, tsdown, Stryker, oxlint), read the actual current source or type definitions. The vendored `repos/effect/` tree is authoritative for Effect APIs.
- **Read before edit:** before editing a file, read it in this session. Do not edit from memory.
- **Verify before claim:** before saying "done," the verification command must have run in this session and its output recorded.
- **Cite, do not invent:** every factual claim about the codebase must come from a tool read in this session, not from training memory.

## Commits

`pnpm exec commitlint`: `type(scope): subject ≤72 chars`. Types: feat/fix/chore/build/ci/deps/docs/perf/refactor/revert/style/test. Scope: package dir or `repo`/`deps`/`release`/`ci`. `feat`/`fix` MUST touch production source; configs/`.claude/` → `chore/build/ci/deps`. GPG-signed `Ryan Lee <drdgvhbh@gmail.com>`. No AI co-author trailers.

🛑 **NEVER enable `isolatedDeclarations`** — incompatible with idiomatic Effect (verified 153 errors).

🛑 **NEVER modify `minimumReleaseAgeExclude` in `pnpm-workspace.yaml`** — sealed by supply-chain policy. If a version is younger than the 24h cutoff, pin the dependency tighter (e.g. `~0.22.9`) or wait. No exceptions.

## Version Control — jj

jj colocated with git. Direct `git` blocked by hook; `jj …` and package-script git allowed.

| git                      | jj                                                        |
| ------------------------ | --------------------------------------------------------- |
| status/diff/log          | `jj st` / `jj diff` / `jj log --no-graph`                 |
| commit -m / --amend      | `jj commit -m` / `jj squash`                              |
| rebase / branch / switch | `jj rebase` / `jj bookmark` / `jj edit\|jj new`           |
| push / fetch / stash     | `jj git push` / `jj git fetch` / named change + `jj edit` |

## Human Approval Boundaries

The agent may propose, prepare, and run checks, but must ask the user before:

- Merging to `main`, deploying, publishing a package.
- Running destructive operations (`rm -rf`, dropping databases, force-push).
- Using credentials, tokens, secrets, or destructive tooling.
- Changing `minimumReleaseAgeExclude` or release workflow.

## Multi-Agent Ownership

When multiple agents work in the same repo simultaneously:

- Each agent owns a disjoint file/module set.
- An agent must claim a file before editing it (via hub or task assignment).
- Agents may not recursively delegate to each other.
- The root-level one-shot verification must pass before any agent claims done.

## Escalation

If you encounter:

- **Architecture decisions:** consult repository docs (`ARCHITECTURE.md`, `CONSTITUTION.md` if present), otherwise ask the user.
- **Unclear requirements:** check project docs, otherwise ask the user.
- **Repeated test failures:** record via the runtime memory system and task list, flag for human review, do not bypass checks to make verification pass.
- **Scope ambiguity:** re-read this file and the Definition of Done.
- **Vendored code changes:** `repos/constitution/`, `repos/effect/`, `repos/typescript-go/` are read-only. Amend upstream, never the vendored copy.

## End of Session

Before ending a session:

1. Record current state, blockers, and next steps via the runtime memory system and task list.
2. Commit with a descriptive message once work is in a safe state. Use `jj commit -m`.
3. Leave the repo clean — `jj st` should show nothing unexpected.
