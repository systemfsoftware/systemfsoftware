# systemfsoftware — workspace invariants

Effect-TS libraries and the oxlint plugin enforcing the constitution (vendored at `repos/constitution/`; amend upstream). Leaf `AGENTS.md` files carry per-directory deltas; the delivery hook refuses the first write under a governing leaf until it is read.

## Doctrine Index

`CONSTITUTION.md` is not in context. Read the one article the decision needs; never re-derive an axiom from memory. Ordered by how often an agent violated the article without having read it.

- Article A, Application — a failing gate outranks a quoted clause. Read when someone cites a clause at you.
- Article IV, Organization — organize by capability, names scream the domain, one responsibility per module. Read before naming a file or splitting a module.
- Article III, Verification — testing trophy, properties over examples, mutation as the measure, behavior where the mutator can see it. Read before choosing a test layer or a mutation scope.
- Article II, The Boundary — functional core with an imperative shell, effects as values, the I/O sandwich, decode never cast. Read before writing an executor, adapter, ACL, or handler.
- Article V, Conduct — depth over expedience, scope discipline, first principles over precedent, subtract before adding. Read when tempted by a patch, a copy-paste, or one more helper.

Article I binds through lint and the type system. Run the gate; reading it to comply is wasted.

## Safety

```yaml
- id: REPO-S5
  title: NEVER put a shell cell in a mutation surface
  do: mutate only pure decisions — `*.workflow.ts` in a cell package, the rule file in a lint plugin, `*.schema.ts` where generated laws do not already cover it
  dont: add any shell-cell suffix (`*.executor.ts`, `*.kernel.ts`, `*.acl.ts`, `*.store.ts`, `*.handler.ts`, `*.middleware.ts`, `*.state.ts`, `*.adapter.ts`, `*.policy.ts`, `*.shape.ts`, `*.observer.ts`) to a `mutate` glob; leave `mutate` unset so the Stryker default sweeps every source file and auto-enrols each new cell
  harm: wrong observer. The mutator asks "do the tests notice a changed decision?" — a shell cell decides nothing, so every mutant is equivalent or is killed by a composition test that was proving something else. The score certifies nothing and the package pays hours of runtime for it
  check: `node scripts/guard-mutate-scope.mjs` exits 0, wired into `pnpm check:local`

- id: REPO-S6
  title: Enforcement for a published concern ships inside the published artifact
  do: carry the rule in a published oxlint plugin or a published type signature, with the failing fixture in that package's own suite; declare a genuinely repo-local rule (workspace layout, release metadata, vendored trees) in the `scripts/guard-script-provenance.mjs` manifest
  dont: enforce a doctrine we publish with a `scripts/*.mjs` gate, a `pnpm check` step, `CONSTITUTION.md`, or the wiki — a consumer installs packages, not this repository; read a doctrine artifact from a script, which promotes prose to a spec nobody maintains
  harm: the rule binds one clone. Everywhere else the same doctrine arrives as prose in a skill, which is the channel restraints do not survive — the design looks enforced here and is advisory for every consumer
  check: `pnpm check:script-provenance` exits 0. The judgement half stays with the reviewer: name the artifact a stranger installs that carries the rule. `scripts/`, `pnpm check`, `CONSTITUTION.md` and the wiki are not answers
```

- **REPO-S1** — `isolatedDeclarations` stays disabled in every tsconfig; it produces 153 compile errors in idiomatic Effect. Gate: `.claude/hooks/guard-protected-writes.ts`.
- **REPO-S2** — never modify `minimumReleaseAgeExclude`; pin a young dependency tighter or wait out the 24h cutoff. Gate: `.claude/hooks/guard-protected-writes.ts`.
- **REPO-S3** — `repos/` is a vendored subtree, read-only; amend upstream. `repos/AGENTS.md` is ours. Gate: `.claude/hooks/guard-protected-writes.ts`.
- **REPO-S4** — never hand-edit `package.json#exports` or `publishConfig.exports` on a tsdown package; change `tsdown.config.ts`. Gate: `pnpm check:exports`.

## Stack

Not derivable from the manifests:

- `pnpm --filter <pkg> <cmd>` from the root. Never `cd` into a package, never `npx`.
- Lint is a per-package `oxlint.config.ts` extending `@systemfsoftware/oxlint-config`. Registration is not delivery — a rule reaches only the packages that opt in. Gate: `pnpm check:lint-coverage`, which also defines the production/tooling boundary. Never re-derive that boundary by hand.
- Mutation runs on pure decisions only (`REPO-S5`), and fails when a `*.property.test.ts` kills no mutant nothing else kills. Opt out with `requireTestContribution: null` in the package's `stryker.config.json`, never by deleting a test.

## Surface Classes

| Surface              | Examples                                                                                                                        | Rule                                                                                                                                                                                 |
| -------------------- | ------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Evaluator**        | `scripts/guard-*.mjs`, `scripts/check-*.mjs`, `packages/stryker-js/mutation-run/src/test-contribution.ts`, `.github/workflows/` | Never change in the same commit as the work it judges. Its own commit, gate observed red before and green after, for the right reason.                                               |
| **Doctrine**         | `CONSTITUTION.md`, `CONCEPTS.md`, every `AGENTS.md`, `wiki/`, `docs/solutions/`                                                 | Editable, but never an input to a gate. Enforced by `pnpm check:script-provenance`.                                                                                                  |
| **Editable**         | Everything else, including `packages/*/`, `scripts/`, `docs/`, `tsdown.config.ts`                                               | Edit freely, including the rules that govern you. Never weaken a rule, threshold, budget or glob to make the current change pass; loosening needs its own commit and its own reason. |
| **Human-controlled** | Merge to `main`, publish, deploy, destructive ops, credentials                                                                  | `REPO-P1`.                                                                                                                                                                           |

## Directory Map

Directories only; files are discovered with tools.

| Directory   | What it is                                   | Governance                                  |
| ----------- | -------------------------------------------- | ------------------------------------------- |
| `packages/` | Workspace packages                           | Root invariants plus a hook-delivered leaf  |
| `repos/`    | Vendored git subtrees, read-only             | `REPO-S3`; registry in `subtrees.toml`      |
| `scripts/`  | Root guards, release and harness tooling     | Editable except the Evaluator scripts above |
| `.github/`  | CI workflows and reusable actions            | Evaluator                                   |
| `docs/`     | Solutions, plans, audits, decision records   | `REPO-E1`                                   |
| `omp/`      | OMP plugin packages                          | Leaf-governed                               |
| `wiki/`     | Gitignored corpus, absent from a fresh clone | `REPO-W4`                                   |

## Startup

1. `pwd` — must be the monorepo root.
2. `pnpm check:local` — repair a red baseline before adding scope.
3. Confirm the active task from the task list; `git log --oneline -5` for recent intent.

## Working Rules

- **REPO-W2** — modify only files belonging to the active task. No unasked retries, validation, telemetry or refactors. Reducing accepted scope needs the user's consent. Gate: review — the reviewer names the active task each changed file belongs to.
- **REPO-W4** — search the gitignored `wiki/` corpus before writing a plan, choosing between options, settling a design question, or asking the user one. Enter at its `manifest.md`, open at most five candidate slugs, stop as soon as one settles it, and read the per-claim Warrant table rather than the frontmatter band. Never cite a `wiki/` path in a plan, doc, commit or issue — the corpus does not ship with the clone. A nil result names the verbatim query and the corpus-scoped path it ran against, so anyone holding the corpus can re-run it and falsify the claim. Gate: `.claude/hooks/guard-protected-writes.ts` refuses a write under `docs/plans/` until a `-c wiki` query has run this session; it confirms a search happened, not that it was good.

## Definition of Done

- **REPO-D1** — target behaviour implemented and exercised, `pnpm check:local` run _after_ the last edit, and the work delivered as a pull request watched to green. Tree left restartable. Gate: `pnpm check:local` exits 0; `gh pr checks --watch --fail-fast` exits 0; and where the branch diff names a source file in a package carrying a `stryker.config.json`, `pnpm --filter <pkg> mutation` reports 100% on the changed pure-core files — CI's Mutation workflow is `continue-on-error`, so it never carries that verdict.
- **REPO-D2** — commit, push a branch and open the PR with the session's commit-push-open-PR skill where one is installed, then watch the checks. `no checks reported` is the post-create registration race, not a failure: sleep and re-poll, never re-push to clear it — `cancel-in-progress: true` means a re-push cancels the run being awaited. Re-push only for a named failing check. Merging stays human (`REPO-P1`). Gate: `gh pr checks --watch --fail-fast` exits 0.

## Verification

`pnpm check:local` is the agent's gate: `check:ci`'s task list minus `test:contract` and the two `dist/`-reading root checks. The contract lanes are `cache: false` and 85-92% of `check:ci`'s wall clock; they need a live container runtime. All three run in CI on every PR, so a change touching `package.json#exports`, `publishConfig.exports` or a runtime dependency (`REPO-S4`) has no local signal and is unverified until the PR is green.

- **REPO-A1** — run exactly `pnpm check:local`. No `--skip`, no `--grep`, no filter flags, no individual steps.
- **REPO-A2** — local evidence from this session, after the last edit; CI evidence from a completed, non-cancelled run whose head SHA is the pushed commit. Never a prior session, never a run predating the last push. Gate: review — the reviewer confirms both.
- **REPO-A3** — any failure blocks done, local or CI, including one that looks unrelated.

## Release and Commits

- **REPO-R1** — every package is pre-1.0 ALPHA; API stability is never a design constraint. When a change is cleaner as a break, make the break; accept proposed breaks without resistance and do not wait for a major release. A compatibility objection is rejected unless it names a concrete in-repo consumer migration. Gate: `pnpm exec commitlint` accepts the `api!` marker and the `BREAKING CHANGE:` footer that record the break.
- **REPO-C1** — `type(scope): subject`, 72 characters or fewer. Gate: `pnpm exec commitlint --edit <msgfile>`.
- **REPO-C2** — feat, fix, chore, build, ci, deps, docs, perf, refactor, revert, style, test. Config-only changes are not feat or fix. Gate: `pnpm exec commitlint`, run by the `commit-msg` hook on every commit touching a path outside the vendored trees.

## Boundaries

- **REPO-P1** — ask before merging to `main`, publishing, deploying, destructive operations, or handling credentials. Unmechanizable: a hook able to decide it would already be the approval.
- **REPO-M1** — each agent owns a disjoint file set. Isolate concurrent work in a git worktree rather than coordinating edits. Gate: review — the reviewer confirms no two agents claim the same file.
- **REPO-E1** — read `docs/solutions/` before implementing or debugging in an area it documents; it holds solved problems filed with `module`, `tags` and `problem_type` frontmatter. Gate: review — the reviewer names the solution doc the change rests on, or states that none covers the area.

## Instruction Hierarchy

A rule lives in exactly one file: the highest level it applies to. A leaf carries only its delta and never restates this file. A leaf is earned where a directory has a different toolchain, ownership or risk class _and_ an agent demonstrably got something wrong there — a package manifest is not evidence, symmetry with a sibling is not a reason.

`repos/<name>/AGENTS.md` are vendored roots, not leaves; amend upstream. `repos/AGENTS.md` is ours. A fork under `packages/` is ours: we publish it and we gate it, and "upstream" names only where it came from.
