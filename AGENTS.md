# systemfsoftware

TypeScript libraries and tooling for pure-core/imperative-shell architecture, Effect-TS integration, and deterministic testing.

## Standing Law

Density-budgeted root invariants. Rules bind through deterministic gates run before claiming done, not layout or prose position (ADOC-A1). Read `CONSTITUTION.md` before architecture or rule authoring.

Startup: confirm working directory and active task; run `pnpm check:local` and repair failures before adding scope.

## Routing

Load docs on-demand when triggers fire; do not perform eager multi-spec reads at startup.

| Doc                        | Trigger                                                      |
| -------------------------- | ------------------------------------------------------------ |
| `CONSTITUTION.md`          | architecture changes, rule authoring, or design disputes     |
| `CONSTITUTION-ARTICLES.md` | editing source files (pure core, types, boundaries, testing) |
| `CONCEPTS.md`              | domain vocabulary, taxonomy, or convention lookup            |
| `.github/AGENTS.md`        | CI check failure or workflow modification                    |
| `docs/solutions/`          | researching past decisions, postmortems, or known patterns   |

## Stack & Conventions

Not derivable from manifests:

- Run `pnpm --filter <pkg> <cmd>` from workspace root; never `cd` into packages, never `npx`.
- Production code must use `@systemfsoftware/effect-cell-types` for workflow and cell contracts.
- Production code must use `@systemfsoftware/effect-schema-vite` to auto-discover Schema exports and run property tests.
- Lint via per-package `oxlint.config.ts`; production code must use the `all` preset. Gate: `pnpm check:local`.

## Surface Classes

| Surface       | Examples                                                                                                | Rule                                                                                            |
| ------------- | ------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| **Evaluator** | `scripts/guards/check-changeset.ts`, `@systemfsoftware/stryker-test-contribution`, `.github/workflows/` | Its own commit, never shared with the work it judges; gate observed red before and green after. |
| **Doctrine**  | `CONSTITUTION.md`, `CONSTITUTION-ARTICLES.md`, `CONCEPTS.md`, every `AGENTS.md`, `docs/solutions/`      | Editable, but never an input to a gate.                                                         |
| **Editable**  | `packages/*/`, `scripts/`, `docs/`, `tsdown.config.ts`                                                  | Edit freely; `CONST-E4` governs loosening constraints.                                          |

## Directory Map

Root doctrine files `CONSTITUTION.md`, `CONSTITUTION-ARTICLES.md`, `CONCEPTS.md`. Run `pnpm map` for current packages, publish targets, and leaf coverage.

| Directory        | What it is                                                     | Governance                               |
| ---------------- | -------------------------------------------------------------- | ---------------------------------------- |
| `packages/`      | Workspace packages published for external adopters             | Root invariants plus hook-delivered leaf |
| `repos/`         | Vendored third-party trees (`subtrees.toml`), read-only        | `REPO-S3` read-only; `REPO-W4`           |
| `scripts/`       | Root guards (`guards/`) and release/harness tools (`tools/`)   | Editable except Evaluator scripts        |
| `.github/`       | CI workflows and reusable actions; `.github/AGENTS.md` runbook | Evaluator                                |
| `.claude/`       | Hook scripts (`hooks/`) and harness settings                   | Evaluator                                |
| `docs/`          | Plans, audits, notes (`docs/solutions/` is Doctrine)           | Editable                                 |
| `omp/`           | OMP plugin packages                                            | Leaf-governed                            |
| `agent-plugins/` | Distributable agent-plugins.org plugins                        | Leaf-governed                            |

## Rules — Must Hold At Done

Every row is load-bearing and names its runnable gate.

| ID          | Rule                                                                                                                                                                                                                                        | Gate                                                                                        |
| ----------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| **REPO-S3** | `repos/` is a vendored third-party reference subtree; never edit it.                                                                                                                                                                        | `.claude/hooks/guard-protected-writes.ts`                                                   |
| **REPO-S4** | Never hand-edit `package.json#exports` or `publishConfig.exports` on a tsdown package; edit `tsdown.config.ts`.                                                                                                                             | `review`                                                                                    |
| **REPO-O1** | Packages under `packages/`, `omp/`, and `agent-plugins/` are owned outright. Do not treat as forks or defer to external upstreams; refactor like first-party code.                                                                          | `review`                                                                                    |
| **REPO-W4** | Resolve third-party questions by reading the vendored tree in `repos/`, never from memory or `node_modules` (built `dist/`). Cite the vendored path read.                                                                                   | `review`                                                                                    |
| **REPO-W7** | The repo is the subject under test, not the warrant. Precedent, installed rules, or existing patterns do not justify a design; derive from principles.                                                                                      | `review`                                                                                    |
| **REPO-W8** | Costly-to-reverse choices (frameworks, wire formats, shared boundaries, wide dependencies) must be researched before adoption: evaluate ≥2 alternatives and record under `docs/`.                                                           | `review`                                                                                    |
| **REPO-D1** | Target behaviour implemented and exercised, `pnpm check:local` run after last edit, work delivered as a pull request watched to green. Tree left restartable.                                                                               | `pnpm check:local` exits 0; `gh pr checks --watch --fail-fast` exits 0                      |
| **REPO-D3** | Never start local mutation runs; mutation scores are evaluated in CI via the advisory Mutation workflow report.                                                                                                                             | `.claude/hooks/guard-local-mutation.ts`                                                     |
| **REPO-R1** | Packages are pre-1.0 ALPHA; make breaking changes directly when cleaner rather than waiting for major releases, unless blocking an active user migration.                                                                                   | `pnpm exec commitlint` accepts `api!` and `BREAKING CHANGE:`                                |
| **REPO-R2** | If a publishable package's `turbo build` hash changed, ship a `.changeset/` intent via `pnpm change --bump <none\|patch\|minor\|major>` (`none` = internal-only change). Body ships verbatim as CHANGELOG — consumer-observable facts only. | `.github/workflows/changeset-check.yml` decides if required; `review` decides bump and body |
| **REPO-C1** | `type(scope): subject` with no trailing period. Keep subjects concise.                                                                                                                                                                      | `pnpm exec commitlint --edit <msgfile>`                                                     |
| **REPO-C2** | Valid types: `feat`, `fix`, `chore`, `build`, `ci`, `deps`, `docs`, `perf`, `refactor`, `revert`, `style`, `test`. Config-only changes cannot be `feat` or `fix`.                                                                           | `pnpm exec commitlint` via `commit-msg` hook                                                |

## Verification Commands

```bash
# Local pre-delivery verification chain
pnpm check:local

# CI verification watch
gh pr checks --watch --fail-fast
```
