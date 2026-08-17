# systemfsoftware — workspace invariants

## Purpose

- **REPO-A1** — this repository exists to make an agent produce the impure/pure/impure sandwich by construction — gather at the edge, decide in the pure middle, act on the returned decision at the edge. A `kernel` cell is the pure core and takes data; an `executor` cell is the shell and does the I/O. Every other mechanism here is instrumentation for that shape.

```yaml
- id: REPO-A2
  title: The dependency test is Wlaschin's, never Seemann's slogan
  do: price each requirement against Wlaschin's two categories at https://fsharpforfunandprofit.com/posts/dependencies/ — impure, meaning non-deterministic or I/O, or strategy, meaning a second real implementation — and call everything else directly, because "if there is only one implementation ... and it is pure ... there is no need to mock or add extra abstraction if it is not needed"
  dont: mandate a requirement anywhere, or let a Seemann citation stand where the test was the question
  harm: Seemann gives the doctrine as a slogan and no selection criterion, so an agent holding it fails in one of two opposite directions and both are in this tree — it demands zero requirements everywhere, or finds Effect's `R` unavoidable and drops the doctrine whole. His own post declines the universal, calling rejection "not a universal solution", so neither direction is licensed by the text every model reaches for first
  check: review — whether each requirement names impurity or a second implementation, and whether a mandate is being read as a shape to satisfy rather than a cost to justify
- id: REPO-A3
  title: Rejection is internal wiring, so wiring is never exported
  do: export the capability ports a package needs from outside and the service it offers, the way `@effect/platform` exports `FileSystem.FileSystem`; collapse a per-operation projection back into the port it came from and prove the collapse by assignment, since `{ a, b }` is assignable to `{ a }`
  dont: mint a second projection of a port that already exists
  harm: a projection records which members one operation happened to reach for, so exporting it turns internal composition into a surface commitment and forces every consumer to discover and provide N aggregators where one port serves. It escapes silently, because the tag rides the `R` channel of an exported signature and a consumer meets it only at their own call site
  check: "`pnpm check:exported-wiring`"
- id: REPO-A4
  title: A type binds only where something forces the constructor
  do: put an interior constraint in the description types where they can express it — a stage brand whose member name is the sentence a diagnostic reports, a marker interface whose property type states the fix — and land it together with the instrument that forces the construction
  dont: retire a rule into the types without naming what forces the constructor, or give a rule a message claiming a property its predicate does not read
  harm: a marker refuses a call that is made. The annotation form type-checks while deriving no marker at all, so an unforced constructor leaves the constraint stated and unenforced while the rule it replaced is already gone — and a decider that throws or reads the clock satisfies the channel markers untouched, because they constrain the channels and nothing else. A rule whose message outruns its predicate fails from the other side, silently admitting the spelling it exists to catch
  check: review — for each constraint held in the types, what forces the constructor and what the markers do not cover; for each rule, whether its predicate decides the property its message names
- id: REPO-A5
  title: The audience is every adopter; this tree is the first one, never the set
  do: justify a design against someone who installs the package and shares none of this checkout's conventions, gates or tooling, and name what actually reaches them — the emitted type, the exports map, an imported module's runtime behaviour, and a rule package they install
  dont: answer a question about audience, reach or consumers by naming who inside this tree consumes the thing
  harm: every relationship this file names points inward — vendored input, owned packages, in-repo consumers — so an agent asked who consumes a thing answers from the tree and scopes the design to the tree. On 2026-08-16 three consecutive framings in one session did exactly that, concluding the audience was this repo and then a sibling checkout, with REPO-W7 in context throughout — W7 forbids the repo as a warrant but names no audience to reason from, so the agent returns to the only one this file describes. A CI job, a git hook and a repo-local lint rule reach an adopter as zero bits, so a discipline carried only by those is a house rule dressed as a library's
  check: review — for each design decision, whether its warrant names something an adopter outside this checkout can observe, and whether each instrument it leans on is one that ships to them
```

## Safety

- **REPO-S3** — `repos/` is a vendored third-party reference subtree, read-only — never edit it. Gate: `.claude/hooks/guard-protected-writes.ts`.
- **REPO-S4** — never hand-edit `package.json#exports` or `publishConfig.exports` on a tsdown package; change `tsdown.config.ts`. Gate: `pnpm check:exports`.
- **REPO-O1** — every package under `packages/`, `omp/`, and `agent-plugins/` is owned outright. A ported or forked package's origin is history, never governance: do not defer to an original project, do not contribute changes back, do not preserve mergeability with one, do not label one "upstream". Refactor any such package like first-party code. Only `repos/` is third-party (REPO-S3). Gate: review — the reviewer rejects any mandate to "contribute back", "keep the diff mergeable", or "intended for upstream", and any instruction file that calls an owned package a fork or upstream.

## Stack

Not derivable from the manifests:

- `pnpm --filter <pkg> <cmd>` from the root. Never `cd` into a package, never `npx`.
- Lint is a per-package `oxlint.config.ts` extending `@systemfsoftware/oxlint-config`. Registration is not delivery — a rule reaches only the packages that opt in. Gate: `pnpm check:lint-coverage`, which also defines the production/tooling boundary — never re-derive it by hand.
- Mutation runs on pure decisions only, and fails when a `*.property.test.ts` kills no mutant nothing else kills. Opt out with `requireTestContribution: null` in the package's `stryker.config.json`, never by deleting a test. Which files a package mutates is that package's `stryker.config.json` and nothing above it: a filename suffix is not a scoping instrument, because a rule keyed on one never fires on the violation it exists to catch — see `docs/solutions/architecture-patterns/label-routed-rules-are-unfalsifiable.md`.

## Surface Classes

| Surface              | Examples                                                                                                  | Rule                                                                                                       |
| -------------------- | --------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| **Evaluator**        | `scripts/guards/*.mjs`, `packages/stryker-js/mutation-run/src/test-contribution.ts`, `.github/workflows/` | Its own commit, never shared with the work it judges; gate observed red before and green after.            |
| **Doctrine**         | `CONSTITUTION.md`, `CONCEPTS.md`, every `AGENTS.md`, `docs/solutions/`                                    | Editable, but never an input to a gate. Read `CONSTITUTION.md` before architecture or rule-authoring work. |
| **Editable**         | Everything else, including `packages/*/`, `scripts/`, `docs/`, `tsdown.config.ts`                         | Edit freely, including the rules that govern you; `CONST-E4` governs loosening one.                        |
| **Human-controlled** | Merge to `main`, publish, deploy, destructive ops, credentials                                            | `REPO-P1`.                                                                                                 |

## Directory Map

Directories and the root doctrine file `CONCEPTS.md`; the packages inside them are never listed here, because a hand-written inventory is stale on the next `pnpm add` and reads as complete while it is not — the one this replaced named 20 of 40. Run `pnpm map` when you need the shape of the tree: which packages exist, which carry their own leaf, which publish. It derives every fact from `pnpm-workspace.yaml` and `git ls-files` on each run, and it names what it does not cover.

| Directory         | What it is                                                                                                                            | Governance                                  |
| ----------------- | ------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------- |
| `packages/`       | Workspace packages, published for adopters outside this tree (`REPO-A5`); `pnpm map` derives the inventory and its governance         | Root invariants plus a hook-delivered leaf  |
| `repos/`          | One `[[repos]]` entry in `subtrees.toml` ↔ one `repos/<name>` tree: third-party source, tests and git history, read-only              | `REPO-S3` read-only; `REPO-W4`              |
| `scripts/`        | Root guards (`guards/`, wired into the check chain or CI) and utilities (`tools/`, wired into no chain); release and harness tooling  | Editable except the Evaluator scripts above |
| `.github/`        | CI workflows and reusable actions; `.github/AGENTS.md` is the repo's only CI-failure runbook — read it when a check fails, not before | Evaluator                                   |
| `.claude/`        | Hook scripts that enforce the gates (`hooks/`) and harness settings                                                                   | Evaluator                                   |
| `docs/`           | Plans, audits, issue notes, explainers, papers — everything outside `docs/solutions/`                                                 | Editable                                    |
| `docs/solutions/` | Documented decisions and learnings, categorized by topic                                                                              | Doctrine                                    |
| `CONCEPTS.md`     | Project vocabulary — the terms every agent must use identically                                                                       | Doctrine                                    |
| `omp/`            | OMP plugin packages                                                                                                                   | Leaf-governed                               |
| `agent-plugins/`  | Distributable agent-plugins.org plugins (Deno, standalone)                                                                            | Leaf-governed                               |

## Working Rules

- **REPO-W4** — answer "how does the third-party actually do this" by reading the vendored tree in `repos/` — never from memory, never from `node_modules` (a built `dist/`: no sources, tests or history). Cite a `repos/<name>/…` path read this session; a dependency absent from `repos/` is the one case that sends you elsewhere. Inward-facing half of `REPO-W8`. Gate: review — the reviewer names the vendored path read, or states the dependency is not vendored.
- **REPO-W7** — the repository is the subject under test, never the warrant. Observing what code, a config, a lint rule or a sibling package does settles a question of fact — whether a gate fires, what a rule rejects — and nothing about what ought to be. A design conclusion drawn from established practice, an installed rule, a shipped default or a prior commit is circular; where derivation and the repository disagree, the repository is wrong until the derivation is defeated by argument. How many packages already do something is not an argument. Gate: review — the reviewer names the derivation each design decision rests on, and rejects any warrant whose only support is that the repo already does it.
- **REPO-W8** — a choice that is costly to reverse is researched before it is made, never defaulted into: a framework, a protocol implementation, a wire format, a runtime boundary, or a dependency that will spread across modules. Establish what comparable projects actually ship by reading their manifests or source, never by recalling it; name at least two candidates and why the losers lost; confirm no maintained implementation exists before hand-rolling one. Record the candidates, the deciding criterion and the reversing observation under `docs/`. The first plausible option compiles and passes; its ceiling shows only after everything depends on it. Outward-facing half of `REPO-W4`. Gate: review — for each new dependency and each hand-rolled protocol in the diff, the reviewer names its record and the alternative it beat.

## Definition of Done

- **REPO-D1** — target behaviour implemented and exercised, `pnpm check:local` run _after_ the last edit, and the work delivered as a pull request watched to green. Tree left restartable. Gate: `pnpm check:local` exits 0; `gh pr checks --watch --fail-fast` exits 0.
- **REPO-D2** — commit, push a branch and open the PR with the session's commit-push-open-PR skill where one is installed, then watch the checks. `no checks reported` is the post-create registration race: sleep and re-poll, never re-push — `cancel-in-progress: true` means a re-push cancels the run being awaited. Re-push only for a named failing check. Merging stays human (`REPO-P1`). Gate: `gh pr checks --watch --fail-fast` exits 0.
- **REPO-D3** — no agent starts a mutation run. One costs minutes to hours of every core, and it is the session's own machine that stalls: on 2026-08-16 an agent launched ten package runs in three background batches, they starved each other and the foreground gate, one hit a 3600s timeout, and none produced a verdict before the PR opened. The score lives in the Mutation workflow's merged report, which lists every package's score and its survivors. That workflow is advisory by construction — `merge-mutation-reports.mjs` never exits on a score — so a score below 100 is a human's call on the report, not a check an agent can wait for; a user who wants a local run starts it themselves, in a shell no hook intercepts. Gate: `.claude/hooks/guard-local-mutation.ts`, whose `--selftest` covers 25 command shapes including the loop-and-capture forms that started the ten runs.

## Release and Commits

- **REPO-R1** — every package is pre-1.0 ALPHA; API stability is never a design constraint. When a change is cleaner as a break, make the break; never wait for a major release. A compatibility objection is rejected unless it names a migration someone actually performs — an adopter's or this tree's; "someone might depend on it" is not one, and an adopter's cost counts even though no in-repo caller moves. Gate: `pnpm exec commitlint` accepts the `api!` marker and the `BREAKING CHANGE:` footer.
  <<<<<<< Updated upstream
- **REPO-R2** — a change that alters a publishable package's turbo `build` task hash ships with a `.changeset/` intent via `pnpm change --bump <none|patch|minor|major>`; a hash that did not move demands no intent, no matter which files were touched — determinism is the point, only the engine decides reach. The bump comes from what a consumer observes from outside the package, never from the diff's size: `none` is exactly the case where shipped sources changed but no exported name, type or behaviour did (devDependency-only and script-only bumps are its canonical class), and review consumes `none` intents before merging — a `none` on a behavior-visible change is the silent non-release the gate exists to catch. Gate: `.github/workflows/changeset-check.yml` (running `scripts/guards/check-changeset.ts`) decides whether an intent is required via the hash verdict — pinned base SHA vs PR head, computed by the lockfile-installed turbo — never which bump is right.
- **REPO-R3** — a changeset body ships verbatim as the published CHANGELOG entry, read by someone who installed the package from a registry and has never seen this repository; write only what they can observe or must do. Never a module path, a file, a line number, a commit sha, a bundler or type-emitter quirk, a gate or script name, a test count, a `Verification:` line, or a review severity — the commit already carries the mechanism for contributors, and repeating it in the changeset does not preserve it, it publishes it. Gate: review — whether every sentence names something a consumer can observe or must do.
- # **REPO-R3** — a changeset body ships verbatim as the published CHANGELOG entry, read by someone who installed the package from a registry and has never seen this repository; write only what they can observe or must do. Never a module path, a file, a line number, a commit sha, a bundler or type-emitter quirk, a gate or script name, a test count, a `Verification:` line, or a review severity — the commit already carries the mechanism for contributors, and repeating it in the changeset does not preserve it, it publishes it. Gate: review — whether every sentence names something a consumer can observe or must do.
- **REPO-R2** — a change to a publishable package (`packages/**`) ships with a `.changeset/` intent via `pnpm change --bump <none|patch|minor|major>`; `--bump none` only for a genuinely non-releasable touch — on a behavior-visible change it is the silent non-release the gate exists to catch, and review consumes `none` intents before merging. Gate: `.github/workflows/changeset-check.yml` fails a PR that touches a publishable package without an intent.

>>>>>>> Stashed changes

- **REPO-C1** — `type(scope): subject`, and the subject carries no trailing period. Nothing rejects a long subject — `header-max-length` is deliberately `[0]` — so keep subjects short for the reader, never for a gate, and never write a rule claiming a length limit. Gate: `pnpm exec commitlint --edit <msgfile>` — it decides the shape, the type and the full stop, never the count.
- **REPO-C2** — feat, fix, chore, build, ci, deps, docs, perf, refactor, revert, style, test. Config-only changes are not feat or fix. Gate: `pnpm exec commitlint`, run by the `commit-msg` hook on every commit touching a path outside the vendored trees.

## Boundaries

- **REPO-P1** — ask before merging to `main`, publishing, deploying, destructive operations, or handling credentials. Unmechanizable: a hook able to decide it would already be the approval.
