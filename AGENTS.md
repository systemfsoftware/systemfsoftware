# systemfsoftware — workspace invariants

## Safety

- **REPO-S3** — `repos/` is a vendored subtree, read-only; amend upstream. Gate: `.claude/hooks/guard-protected-writes.ts`.
- **REPO-S4** — never hand-edit `package.json#exports` or `publishConfig.exports` on a tsdown package; change `tsdown.config.ts`. Gate: `pnpm check:exports`.

## Stack

Not derivable from the manifests:

- `pnpm --filter <pkg> <cmd>` from the root. Never `cd` into a package, never `npx`.
- Lint is a per-package `oxlint.config.ts` extending `@systemfsoftware/oxlint-config`. Registration is not delivery — a rule reaches only the packages that opt in. Gate: `pnpm check:lint-coverage`, which also defines the production/tooling boundary — never re-derive it by hand.
- Mutation runs on pure decisions only, and fails when a `*.property.test.ts` kills no mutant nothing else kills; `check:mutate-scope` enforces the scope. Opt out with `requireTestContribution: null` in the package's `stryker.config.json`, never by deleting a test.

## Surface Classes

| Surface              | Examples                                                                                                  | Rule                                                                                            |
| -------------------- | --------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| **Evaluator**        | `scripts/guards/*.mjs`, `packages/stryker-js/mutation-run/src/test-contribution.ts`, `.github/workflows/` | Its own commit, never shared with the work it judges; gate observed red before and green after. |
| **Doctrine**         | `CONSTITUTION.md`, `CONCEPTS.md`, every `AGENTS.md`, `docs/solutions/`                                    | Editable, but never an input to a gate. Enforced by `pnpm check:script-provenance`.             |
| **Editable**         | Everything else, including `packages/*/`, `scripts/`, `docs/`, `tsdown.config.ts`                         | Edit freely, including the rules that govern you; `CONST-E4` governs loosening one.             |
| **Human-controlled** | Merge to `main`, publish, deploy, destructive ops, credentials                                            | `REPO-P1`.                                                                                      |

## Directory Map

Directories only; files are discovered with tools.

| Directory        | What it is                                                                                                                           | Governance                                  |
| ---------------- | ------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------- |
| `packages/`      | Workspace packages                                                                                                                   | Root invariants plus a hook-delivered leaf  |
| `repos/`         | One `[[repos]]` entry in `subtrees.toml` ↔ one `repos/<name>` tree: full upstream source, tests and git history                      | `REPO-S3` read-only; `REPO-W4`              |
| `scripts/`       | Root guards (`guards/`, wired into the check chain or CI) and utilities (`tools/`, wired into no chain); release and harness tooling | Editable except the Evaluator scripts above |
| `.github/`       | CI workflows and reusable actions                                                                                                    | Evaluator                                   |
| `docs/`          | Solutions, plans, audits, decision records                                                                                           | `REPO-E1`                                   |
| `omp/`           | OMP plugin packages                                                                                                                  | Leaf-governed                               |
| `agent-plugins/` | Distributable agent-plugins.org plugins (Deno, standalone)                                                                           | Leaf-governed                               |

## Working Rules

- **REPO-W4** — answer "how does upstream actually do this" by reading the vendored tree in `repos/` — never from memory, never from `node_modules` (a built `dist/`: no sources, tests or history). Cite a `repos/<name>/…` path read this session; a dependency absent from `repos/` is the one case that sends you elsewhere. Inward-facing half of `REPO-W8`. Gate: review — the reviewer names the vendored path read, or states the dependency is not vendored.
- **REPO-W7** — the repository is the subject under test, never the warrant. Observing what code, a config, a lint rule or a sibling package does settles a question of fact — whether a gate fires, what a rule rejects — and nothing about what ought to be. A design conclusion drawn from established practice, an installed rule, a shipped default or a prior commit is circular; where derivation and the repository disagree, the repository is wrong until the derivation is defeated by argument. How many packages already do something is not an argument. Gate: review — the reviewer names the derivation each design decision rests on, and rejects any warrant whose only support is that the repo already does it.
- **REPO-W8** — a choice that is costly to reverse is researched before it is made, never defaulted into: a framework, a protocol implementation, a wire format, a runtime boundary, or a dependency that will spread across modules. Establish what comparable projects actually ship by reading their manifests or source, never by recalling it; name at least two candidates and why the losers lost; confirm no maintained implementation exists before hand-rolling one. Record the candidates, the deciding criterion and the reversing observation under `docs/`. The first plausible option compiles and passes; its ceiling shows only after everything depends on it. Outward-facing half of `REPO-W4`. Gate: review — for each new dependency and each hand-rolled protocol in the diff, the reviewer names its record and the alternative it beat.

## Definition of Done

- **REPO-D1** — target behaviour implemented and exercised, `pnpm check:local` run _after_ the last edit, and the work delivered as a pull request watched to green. Tree left restartable. Gate: `pnpm check:local` exits 0; `gh pr checks --watch --fail-fast` exits 0; and where the diff names a source file in a package carrying a `stryker.config.json`, `pnpm --filter <pkg> mutation` reports 100% on the changed pure-core files — CI's Mutation workflow is `continue-on-error` and never carries that verdict.

## Release and Commits

- **REPO-R1** — every package is pre-1.0 ALPHA; API stability is never a design constraint. When a change is cleaner as a break, make the break; never wait for a major release. A compatibility objection is rejected unless it names a concrete in-repo consumer migration. Gate: `pnpm exec commitlint` accepts the `api!` marker and the `BREAKING CHANGE:` footer.
- **REPO-R2** — a change to a publishable package (`packages/**`) ships with a `.changeset/` intent via `pnpm change --bump <none|patch|minor|major>`; `--bump none` only for a genuinely non-releasable touch — on a behavior-visible change it is the silent non-release the gate exists to catch, and review consumes `none` intents before merging. Gate: `.github/workflows/changeset-check.yml` fails a PR that touches a publishable package without an intent.
- **REPO-C1** — `type(scope): subject`, 72 characters or fewer. Gate: `pnpm exec commitlint --edit <msgfile>`.
- **REPO-C2** — feat, fix, chore, build, ci, deps, docs, perf, refactor, revert, style, test. Config-only changes are not feat or fix. Gate: `pnpm exec commitlint`, run by the `commit-msg` hook on every commit touching a path outside the vendored trees.

## Boundaries

- **REPO-P1** — ask before merging to `main`, publishing, deploying, destructive operations, or handling credentials. Unmechanizable: a hook able to decide it would already be the approval.
