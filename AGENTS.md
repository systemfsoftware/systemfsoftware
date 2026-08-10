# AGENTS.md — systemfsoftware monorepo

Effect-TS libraries + the oxlint plugin enforcing the constitution (at `repos/constitution/`; amend upstream, never vendored copy). Root holds workspace invariants; leaf packages carry deltas.

## Safety

```yaml
- id: REPO-S1
  title: NEVER enable isolatedDeclarations
  do: keep isolatedDeclarations disabled in every tsconfig
  dont: enable isolatedDeclarations anywhere
  harm: 153 compile errors in idiomatic Effect
  check: `grep -rl '"isolatedDeclarations": true' --include='tsconfig*.json' .` returns nothing

- id: REPO-S2
  title: NEVER modify minimumReleaseAgeExclude
  do: pin younger deps tighter (e.g. ~0.22.9) or wait for the 24h cutoff
  dont: modify minimumReleaseAgeExclude in pnpm-workspace.yaml
  harm: supply-chain policy violation
  check: review — the diff touches no `minimumReleaseAgeExclude` entry

- id: REPO-S3
  title: Vendored subtrees are read-only
  do: amend upstream
  dont: edit any tree under repos/<name>/ — vendored subtree content; `repos/AGENTS.md` at the repos/ root is ours and editable (it maps the subtrees)
  harm: vendored copies diverge from upstream
  check: `git diff --name-only HEAD | grep '^repos/'` returns nothing

- id: REPO-S4
  title: Never hand-edit package.json#exports on tsdown packages
  do: change tsdown.config.ts
  dont: edit package.json#exports or publishConfig.exports directly
  harm: exports drift from build output
  check: `pnpm check:exports` exits 0 — exports match build output

- id: REPO-S5
  title: NEVER put a shell cell in a mutation surface
  do: mutate only pure decisions — `*.workflow.ts` in a cell package, the rule file in a lint plugin, `*.schema.ts` where generated laws do not already cover it
  dont: add `*.executor.ts`, `*.kernel.ts`, `*.acl.ts`, `*.store.ts`, `*.handler.ts`, `*.middleware.ts`, `*.state.ts`, `*.adapter.ts`, `*.policy.ts`, `*.shape.ts`, or `*.observer.ts` to any `mutate` glob; leave `mutate` unset (the Stryker default sweeps every source file and auto-enrolls each new cell)
  harm: wrong observer. The mutator asks "do the tests notice a changed decision?" — a shell cell decides nothing, so every mutant is equivalent or is killed by a composition test that was proving something else; the score certifies nothing and the package pays hours of runtime for it
  check: `node scripts/guard-mutate-scope.mjs` exits 0 (wired into `pnpm check`); shell cells stay gated by lint provenance + composition tests, kernels by colocated K-law property tests

- id: REPO-S6
  title: Enforcement for a published concern ships inside the published artifact
  do: carry a rule in a published oxlint plugin or a published type signature; put the failing fixture in that package's own suite; when the rule is genuinely repo-local (workspace layout, release metadata, vendored trees, local tooling), declare it in the `scripts/guard-script-provenance.mjs` manifest with the category that admits it
  dont: enforce a doctrine we publish with a `scripts/*.mjs` gate, a `pnpm check` step, `CONSTITUTION.md`, or the wiki — a consumer installs packages, not this repository; read a doctrine artifact from a script, which promotes prose to a spec nobody maintains
  harm: the rule binds one clone. Everywhere else the same doctrine arrives as prose in a skill, which is the channel restraints do not survive; the design looks enforced here and is advisory for every consumer
  check: `pnpm check:script-provenance` exits 0 — `scripts/` is a closed set and no script reads doctrine. The judgement half stays with the reviewer: name the artifact a stranger installs that carries the rule. `scripts/`, `pnpm check`, `CONSTITUTION.md`, and the wiki are not answers
```

## Stack

| Concern  | Tool                                   | Note                                                                                                                                                                                                                                                                   |
| -------- | -------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Pkg mgr  | pnpm                                   | `pnpm --filter <pkg> <cmd>` from root; **never** `cd`. No `npx`.                                                                                                                                                                                                       |
| Types    | tsc + api-extractor                    | `pnpm api:check` runs for every package with `api-extractor.json`                                                                                                                                                                                                      |
| Build    | tsdown + turbo                         | ESM (`.mjs` + tsc dts). Build via `pnpm turbo build`.                                                                                                                                                                                                                  |
| Tests    | Vitest + `@effect/vitest` + fast-check | PBT on pure core; composition through I/O sandwich.                                                                                                                                                                                                                    |
| Mutation | Stryker (typescript-checker)           | Pure decisions only — scope is REPO-S5. Gate: `pnpm check:mutate-scope`.                                                                                                                                                                                               |
| Lint     | oxlint + dprint                        | Per-package `oxlint.config.ts` extending `@systemfsoftware/oxlint-config`. Registration is NOT delivery: a rule reaches only packages that opt in. Gate: `pnpm check:lint-coverage`, which also DEFINES production vs tooling — never re-derive that boundary by hand. |

## Doctrine Index

`CONSTITUTION.md` holds the engineering axioms. It is deliberately not loaded on every turn — read the one article the decision in front of you needs, and never re-derive an axiom from memory.

- Article A, Application — how a principle is invoked; a failing gate outranks a quoted clause. Read it when someone cites a clause at you.
- Article I, The Pure Core — purity, types before logic, one variant per error, no primitive obsession, tagged unions over optional fields, one path per decision. Read it before writing a `*.workflow.ts` or a schema.
- Article II, The Boundary — functional core with an imperative shell, effects as values, the I/O sandwich, decode never cast. Read it before writing an executor, adapter, ACL, or handler.
- Article III, Verification — the testing trophy, properties over examples, mutation as the measure, behavior where the mutator can see it. Read it before choosing a test layer or a mutation scope.
- Article IV, Organization — organize by capability, names scream the domain, one responsibility per module. Read it before naming a file or splitting a module.
- Article V, Conduct — depth over expedience, scope discipline, first principles over precedent, subtract before adding. Read it when tempted by a patch, a copy-paste, or one more helper.

## Surface Classes

| Surface              | Examples                                                                                                                                                                                      | Rule                                                                                                                                                                                                                                                                                                                                    |
| -------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Evaluator**        | `packages/stryker-js/mutation-run/src/test-contribution.ts`, `scripts/guard-mutate-scope.mjs`, `scripts/check-lint-coverage.mjs`, `scripts/guard-script-provenance.mjs`, `.github/workflows/` | Never change in the same commit as the work it judges. Evolve it in its own commit, with the reason stated and the gate observed red before and green after for the right reason. Adding a `scripts/` entry means editing the provenance manifest, which is Evaluator — deliberately a separate commit.                                 |
| **Doctrine**         | `CONSTITUTION.md`, `CONCEPTS.md`, every `AGENTS.md`/`CLAUDE.md`, `wiki/`, `docs/solutions/`                                                                                                   | Context engineering: these change what an agent does by being **read by the agent**. Editable under the Editable rule below, plus one prohibition — **never an input to a gate.** No script parses them; a gate over prose asserts a claim nobody maintains and goes green proving nothing. Enforced by `pnpm check:script-provenance`. |
| **Editable**         | Everything else, including every `packages/*/` (oxlint rules included), `scripts/` (except the Evaluator scripts above), `docs/`, `tsdown.config.ts`, `dprint.json`                           | Edit freely, including the rules that govern you. One prohibition, and it binds every surface: **never weaken a rule, threshold, budget, glob, or instruction in order to make your current change pass.** Strengthening is always in scope; loosening needs its own commit and its own reason.                                         |
| **Vendored**         | `repos/`                                                                                                                                                                                      | REPO-S3 — amend upstream.                                                                                                                                                                                                                                                                                                               |
| **Human-controlled** | Merge to `main`, publish, deploy, destructive ops, credentials                                                                                                                                | Ask the user before acting.                                                                                                                                                                                                                                                                                                             |

## Directory Map

High-level map of the workspace: each directory, what it is, and what governs it. Files are discovered, never declared — this map names directories only.

| Directory   | What it is                                                 | Governance                                                                                             |
| ----------- | ---------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| `packages/` | Workspace packages (libraries, plugins, tooling)           | Root invariants + per-package leaf `AGENTS.md` deltas; read the leaf before first edit under a package |
| `repos/`    | Vendored git subtrees, read-only (REPO-S3)                 | `repos/AGENTS.md` leaf; registry in `subtrees.toml`; update via git-subtree-vendor                     |
| `scripts/`  | Root tooling: guards, release, harness scripts             | Editable except the Evaluator scripts named in Surface Classes                                         |
| `.github/`  | CI workflows and reusable actions                          | Evaluator (workflows); `.github/AGENTS.md` leaf for CI debugging                                       |
| `docs/`     | Solutions, plans, decision records                         | Doctrine-adjacent; `docs/solutions/` carries solved problems (REPO-E1)                                 |
| `omp/`      | OMP plugin packages                                        | `omp/AGENTS.md` + `omp/plugins/AGENTS.md` leaves                                                       |
| `wiki/`     | Gitignored knowledge corpus (does not ship with the clone) | REPO-W4 — search before deciding; never cite wiki paths in artifacts                                   |

## Startup Workflow

Before writing code:

1. **Confirm working directory** with `pwd` — must be the monorepo root.
2. **Read this file** completely.
3. **Read the leaf for every directory you will touch.** Nothing below this file auto-loads: `cwd` stays at the root (step 1) and work reaches packages through `--filter`, never `cd`, so no leaf is ever on the path. A leaf `AGENTS.md` reaches you only when you read it. Before your first edit under a package, read that package's `AGENTS.md` if it has one — it carries the deltas this file deliberately omits.
4. **Run baseline verification:**
   ```bash
   pnpm check  # the full gate — see Verification Commands for the chain it runs
   ```
5. **Confirm the active task** with the user or via the task list.
6. **Review recent commits** with `git log --oneline -5`.

If baseline verification fails, repair it first before adding new scope.

## Working Rules

```yaml
- id: REPO-W1
  title: One task at a time
  do: finish current task before starting another
  dont: context-switch
  harm: partial completion across tasks = no verifiable deliverable
  check: review — exactly one task is in progress

- id: REPO-W2
  title: Stay in scope
  do: modify only files related to the current task
  dont: add retries, validation, telemetry, or refactors unasked
  harm: untested scope creep
  check: review — every changed file belongs to the current task

- id: REPO-W3
  title: Record state to runtime memory
  do: save decisions, bugs, conventions to memory; track active work in task list
  dont: rely on file trackers
  harm: next session loses context
  check: review — memory and task list were written before yielding

- id: REPO-W4
  title: Search the wiki before planning or deciding
  do: before writing a plan, choosing between options, settling a design question, debugging a failure, or asking the user a design question — search the gitignored `wiki/` corpus, entering at its `manifest.md` index of one `[[slug]] | title | type` line per page; open at most five candidate slugs and stop as soon as one settles the question; where a page bears on the decision read its per-claim Warrant table too, because the frontmatter band is a summary and the atom is what adjudicates
  dont: run the search from the repo root or unrooted — the corpus is gitignored, so such a search matches nothing inside it and reports that silence as "no ruling"; read the corpus log or its generated first-principles page whole; keep opening pages once one has answered, or widen past five candidates instead of narrowing the question; cite a `wiki/` path in a plan, doc, commit, or issue, because the corpus does not ship with the clone
  harm: the corpus has already adjudicated most of what a plan here decides, so skipping it re-litigates a settled ruling, asks the user a question the corpus answered, or ships a decision the canon refused — and the repo-rooted search that returns nothing silently is what makes the skip feel like diligence
  check: review — the plan restates the ruling it rests on in its own words, carrying the deciding atom's warrant band; a nil result names the verbatim query and the corpus-scoped path it ran against, so anyone holding the corpus can re-run it and falsify the claim; when the corpus is absent, as in a fresh clone, say so once and proceed

- id: REPO-W5
  title: Query qmd with collection syntax, never bare
  do: pass at least one `-c <name>` on every `qmd query`, `qmd search`, and `qmd vsearch`; take the names from `qmd collection list`, and address a known file with `qmd ls <collection>` or `qmd get qmd://<collection>/<path>`, which are already collection-scoped and need no flag
  dont: run a bare `qmd query`/`qmd search`/`qmd vsearch` — it hits every collection flagged `includeByDefault`, and which collections a machine has is local state this file cannot know; substitute a repo-root `grep`/`glob` for the REPO-W4 corpus search, because `wiki/` is gitignored and that search reports its own blindness as silence
  harm: an unscoped query blends corpora that adjudicate at different levels, so a draft can outrank the ruling that governs it and no hit carries its provenance; it also makes a REPO-W4 nil result unfalsifiable — "I searched and found nothing" names no scope, so nobody can re-run it
  check: every `-c` value used resolves in `qmd collection list`, and an unknown name fails loudly (`Collection not found: <name>`); review — no bare invocation in the transcript
```

## Definition of Done

```yaml
- id: REPO-D1
  title: Done means
  do: implement target behavior; run full verification after last edit; record evidence; leave repo restartable; validate publish metadata (repository.url, repository.directory) on publishable package.json changes
  dont: claim done with failing checks, stale evidence, or uncommitted state
  harm: undone work passes as done
  check: `pnpm check` exits 0 from this session after the last edit
```

## Verification Commands

Run in order before claiming done:

```bash
pnpm check  # pnpm install --frozen-lockfile → pnpm check:ci
```

`check:ci` is the **one** definition of the gate. It opens with `pnpm format:check` (`dprint check`) **outside** turbo: dprint is sub-second, is `cache: false` by nature, and every other caller already invokes it directly (`lint:ci`, `precommit` via lint-staged), so wrapping it in a turbo task bought only a 1762-file hash with no reader. It is sequenced with `|| s=1`, never `&&`, so a formatting failure is recorded without masking anything after it. Call one then runs `lint`, `lint:tsgo`, `typecheck`, `test`, `attw`, `api:check`, `test:contract` alongside six root-task guards — `//#check:mutate-scope`, `//#check:lint-coverage`, `//#check:no-hand-rolled-jsonc`, `//#check:publish-config`, `//#check:script-provenance`, `//#check:project-references` — all in parallel under `--continue`, so one run reports every failure rather than the first. Call two runs `//#check:exports` and `//#check:runtime-deps`, which read `dist/` and so must follow a build.

That seam is a turbo limitation, not a preference: a root task's `dependsOn: ["build"]` resolves to `//#build`, which does not exist, and `^build` resolves to the root's workspace dependencies, of which there are zero. So turbo cannot express "root task after all package builds" here, and the two dist-readers are ordered by the `&&` instead. Both fail loudly on an unbuilt tree rather than passing — `check-exports.mjs` counts the builds it saw and `check-runtime-deps.mjs` counts the packages it reached, because every dist-dependent assertion in them is skippable and a skipped run would otherwise report zero issues.

The two other callers add exactly one thing each and duplicate nothing: `pnpm check` prepends the frozen install, and CI runs `pnpm lint:ci` first for GitHub annotations. **A gate added to `check:ci` reaches all three callers.** Before this collapsed, four hand-maintained lists had drifted: `attw` never ran in CI, `check:runtime-deps` ran in one of four, and `.github/AGENTS.md` called `check:ci` "CI-equivalent" while CI did not invoke it.

`pnpm check:publish-config` is part of that chain and is never run on its own (REPO-A1). Every publishable package must carry `repository.url` exactly `git+https://github.com/systemfsoftware/systemfsoftware.git` and a `repository.directory` matching its real path; npm validates both against the sigstore provenance attestation and rejects the upload with **422** otherwise. It earns a gate because the version bump, changelog, commit, and git tag all land _before_ the publish is attempted — a rejection leaves git claiming a release npm never received, which is exactly how `stryker-js-core` and `stryker-js-typescript-checker` sat at `0.1.0` on npm while git advanced to `v1.2.1`.

Then `pnpm --filter <pkg> mutation` — **100%** on changed pure-core files. Any failure blocks done.

That run also judges test contribution, and can fail for a second reason: every `*.property.test.ts` in the package must kill a mutant nothing else kills. If deleting a file would leave every mutant just as dead, the run exits non-zero however high the score, because a score measures the mutant set, not the test set. There is no separate command and nothing to build — the check is part of our Stryker (`packages/stryker-js/mutation-run/src/test-contribution.ts`), defaulted on for `.property.test.ts` by `requireTestContribution`, and reads the report already in memory. It never runs off a stale file on disk. Under bail only files that killed nothing at all are accused, since a second killer can go unrecorded; `disableBail: true` buys the exact measure, which also accuses redundant killers. A run that credits no kill to any test file is reported as an unmeasurable run rather than a package full of toothless tests. Set `requireTestContribution` to `null` in a package's `stryker.config.json` to opt out — visibly, in the config, not by deleting a test.

It judges the test files the run actually executed. Under `"vitest": { "related": true }` a property test that imports nothing in the mutated set never runs, so it is never judged — the one toothless shape this check cannot see.

### Anti-Bypass

```yaml
- id: REPO-A1
  title: Run the full command
  do: run exactly pnpm check
  dont: run individual steps, --skip, --grep, or --no-verify
  harm: partial verification masks failures
  check: review — the command run was exactly `pnpm check`, with no filter flags

- id: REPO-A2
  title: Current-run evidence only
  do: use output from this session after last edit
  dont: reference CI or prior session output
  harm: stale evidence hides regressions
  check: review — the evidence postdates the last edit

- id: REPO-A3
  title: Any failure blocks done
  do: resolve every failure before claiming done
  dont: claim done with red checks even if "unrelated"
  harm: unrelated failures become related after deploy
  check: `pnpm check` exits 0
```

### Hallucination Prevention

```yaml
- id: REPO-H1
  title: Search before write, read before edit, verify before claim
  do: read current source for library APIs; read target file in this session before editing; run verification before claiming done
  dont: write from training memory; edit from memory; claim without evidence
  harm: stale or hallucinated code; unverified claims
  check: review — every edit was preceded by a read, and the done claim carries current verification output
```

## Instruction Hierarchy

This root file holds workspace-wide invariants only. Directories with distinct build, toolchain, ownership, or risk boundaries get their own leaf `AGENTS.md` delta.

- A leaf delta exists where a directory has different verification commands, a different toolchain, a different ownership (vendored, generated), or a different risk class.
- A rule lives in **exactly ONE file:** the highest level it applies to. Leaves carry only the delta and point back here; they never restate the root.
- If a rule in this file applies to exactly one directory, move it to that directory's leaf.

`repos/` is the only vendored tree. The `AGENTS.md` files inside each vendored subtree (`repos/<name>/AGENTS.md`) are vendored roots, not leaves — amend upstream. `repos/AGENTS.md` at the `repos/` root is ours: it is the leaf that maps the vendored subtrees. A fork under `packages/` is **ours**: we publish it, we change it, and "upstream" names where it came from — never a reason to leave it ungated or to preserve a diff nobody will merge.

## Release Policy

```yaml
- id: REPO-R1
  title: Everything is ALPHA; breaking changes are mandatory
  do:
    - treat every package as pre-1.0 ALPHA — API stability is never a design constraint
    - when a change is cleaner as a break, make the break; the better API wins over compatibility
    - accept and implement proposed breaking changes without resistance
    - record each break with the `api!` marker or `BREAKING CHANGE:` footer (commitlint already accepts both)
  dont:
    - preserve backwards compatibility at the cost of design
    - push back on, delay, or soften a proposed breaking change
    - wait for a "major release" to make a break
    - mark any package stable or 1.0 while this rule stands
  harm: APIs calcify around designs nobody believes in; 0.x compatibility debt accumulates until a forced, painful rewrite
  check: review — a compatibility objection to a break is rejected unless it names a concrete in-repo consumer migration; breaks still pass REPO-D1 and REPO-A3
```

## Commits

```yaml
- id: REPO-C1
  title: Commit format
  do: "use `type(scope): subject ≤72 chars`"
  dont: use wrong type or omit scope
  harm: release tooling and changelog rely on conventional commits
  check: `pnpm exec commitlint --edit <msgfile>` exits 0 — the commit-msg hook runs it on every commit that touches a path outside the vendored trees

- id: REPO-C2
  title: Commit types
  do: use feat/fix/chore/build/ci/deps/docs/perf/refactor/revert/style/test
  dont: use feat/fix for config-only changes
  harm: wrong version bumps and changelog categories
  check: review — the type matches the diff shape

- id: REPO-C3
  title: No AI co-author trailers
  do: sign commits as the human author
  dont: add Co-authored-by or AI attribution
  harm: attribution pollution
  check: `git log -1 --format=%B | grep -i 'co-authored-by'` returns nothing
```

## Human Approval

```yaml
- id: REPO-P1
  title: Ask before controlled actions
  do: request approval for merge to main, publish, deploy, destructive ops, credentials
  dont: proceed without explicit approval
  harm: automated destructive or credential-exposing actions
  check: review — every controlled action was preceded by user approval
```

## Multi-Agent Ownership

```yaml
- id: REPO-M1
  title: Disjoint ownership
  do: each agent owns a disjoint file/module set
  dont: edit files another agent owns without coordination
  harm: merge conflicts and contradictory changes
  check: review — no two agents claim the same file
```

## Escalation

```yaml
- id: REPO-E1
  title: When stuck
  do: consult CONCEPTS.md for domain vocabulary; consult ARCHITECTURE.md/CONSTITUTION.md for architecture; read `docs/solutions/` before implementing or debugging in an area it documents — it holds solved problems (bugs, best practices, workflow patterns) filed by category with `module`, `tags`, and `problem_type` frontmatter; check project docs for requirements; flag repeated failures for human review; re-read this file for scope ambiguity
  dont: guess; bypass checks; edit vendored code
  harm: wrong deliverable; masked failures; vendored drift
  check: review — the change names the doc or rule it was grounded in
```

## End of Session

```yaml
- id: REPO-X1
  title: Save state before ending
  do: record decisions, blockers, next steps to memory; commit safe state
  dont: end with uncommitted work or unrecorded decisions
  harm: next session loses context
  check: `git status --porcelain` is empty; review — memory and task list are current
```
