---
title: "docs: the turbo-task-graph pack, two follow-up ci-wall-clock rules, and red-main's precision claim"
type: docs
date: 2026-10-13
status: requirements
artifact_contract: ce-unified-plan/v1
product_contract_source: ce-brainstorm
supersedes: docs/plans/2026-10-12-2317-docs-turbo-task-graph-and-ci-wall-clock-followup-plan.md
---

# The turbo-task-graph pack and the ci-wall-clock follow-up

## Goal Capsule

- **Goal:** three review rules and one correction, in the existing pack format:
  1. `ci-wall-clock/local-gate-equals-pr-gate`: the command run before pushing is the PR gate's own definition;
  2. `ci-wall-clock/failures-name-the-gate-and-location`: a red job names its gate, where it failed, and a local reproduce command;
  3. `turbo-task-graph/selection-and-caching-go-through-turbo`: in a turbo repository, turbo decides what runs, what changed and what is reused. It lives in a new pack that any turbo repository can enrol, so `ci-wall-clock` stays enrolled in this repository only;
  4. `ci-wall-clock/red-main-reverts-its-culprit-same-day` stops implying that its five conditions meet SafeRevert's 99% precision bar.
- **Supersedes:** `docs/plans/2026-10-12-2317-docs-turbo-task-graph-and-ci-wall-clock-followup-plan.md`, which reached GitHub only on this pull request's branch (#748), never `main`. It differs from this plan only by the corrections of the third full-path review of `7a064a89d7`: parallel jobs never save turbo's cache under a shared key (a key is written once); the turbo exemplar selects with turbo's dry run, the same command its reproduce runs, records why a base is missing, gives its summary and wall-time steps ids and drops a reason code for a step that cannot fail; the failures rule states that this repo's action reports a cancelled step as `unclassified` until it matches `cancelled`; and the consumer census counts public repositories only. The 2317 plan carried the second review's corrections over the 2222 plan, which superseded the 2111, 2108, 2047 and 2036 drafts.
- **Authority:** the root's intents of 2026-10-12 (the two slugs named in `docs/plans/2026-10-12-1754-docs-ci-wall-clock-pack-plan.md:433`; the turbo house rule "never roll your own caching when turbo exists"; "ci-wall-clock stays systemfsoftware-only"; the accepted DeepSeek P2 on red-main's precision). Rule ids, placement, wording, examples and the precision ruling below are derived here and open to debate.
- **Delivery:** one pull request off `main` (after #742, merged as `8d07118079`): `compound-packs/turbo-task-graph/` (README and one rule), two rule files and README lines in `compound-packs/ci-wall-clock/`, the red-main correction, the `turbo-task-graph` entry in `.compound-engineering/config.yaml` (U6), and this plan. No `.github/`, `scripts/` or `package.json` edit; no other repository.
- **Stop conditions:** every new or changed rule file passes the pack-format checks #742 used (frontmatter keys `{title, applies_when, tags}`, one `## Rule` heading, WRONG/RIGHT citations that resolve at their SHA, last line starting ``Gate: `review`.``); YAML exemplars that are workflow jobs pass actionlint with shellcheck; the resolver loads every declared pack, `turbo-task-graph` among them, with no error from the committed config; a full-path ce-code-review receipt with a blind MiniMax or DeepSeek peer is in the PR body; the privacy grep is clean; `pnpm check:local` passes apart from the `/dev/kvm` suite CI runs; CI is green.

## Product Contract

### Problem

1. **Selection and caching beside turbo.** Heavy lanes and gates decide what to run, what changed and what to reuse in code turbo does not own, and run work turbo would have skipped (I3, I4 below, in two repositories).
2. **A local gate that is not the PR gate.** #510 (`13fab8d87b`, 2026-09-24) gave `check:local` its own `gate:local` and `CONFORMANCE_PROFILE=local`; the CI gate ran about ten times the work and went from about 7.5 minutes to past its 45-minute timeout (`docs/solutions/performance-issues/ci-gate-silent-then-timed-out-after-kernel-exploration.md:9,41`), whose Prevention line says `check:local` "runs the `local` profile and cannot show it" (`:59`).
3. **A failure that names nothing.** The #519 gate log "had no lines at all from 20:42:31 to 21:04:54" (`:43`). Every Mutation matrix job once failed at `stryker: not found` "while the run shows green because the step has `continue-on-error: true`" (`docs/plans/2026-08-10-001-fix-attw-cli-verification-merge-integration-plan.md:70`).
4. **A precision claim the rule cannot keep.** `red-main-reverts-its-culprit-same-day.md:396` cites SafeRevert's "precision must be above 99%" as its grounds, while its conditions rerun the failing jobs once.

### Rule files

| R  | Pack                     | File                                                 | Id                                                        |
| -- | ------------------------ | ---------------------------------------------------- | --------------------------------------------------------- |
| R1 | `turbo-task-graph` (new) | `selection-and-caching-go-through-turbo.md`          | `turbo-task-graph/selection-and-caching-go-through-turbo` |
| R2 | `ci-wall-clock`          | `local-gate-equals-pr-gate.md`                       | `ci-wall-clock/local-gate-equals-pr-gate`                 |
| R3 | `ci-wall-clock`          | `failures-name-the-gate-and-location.md`             | `ci-wall-clock/failures-name-the-gate-and-location`       |
| R4 | `ci-wall-clock`          | `red-main-reverts-its-culprit-same-day.md` (changed) | unchanged                                                 |

Ids are `<pack>/<file slug>`; a slug is never renamed or reused (`compound-packs/ci-wall-clock/README.md:16`). R1's slug does not repeat its pack's name.

### Placement of R1 (ruling, open to debate)

**Machinery** (primary sources):

- "Packs are **declared, never scanned**: nothing happens until the repo's CE config names one" (https://every.to/compound-engineering/guides/packs). The resolver reads only `<repo-root>/.compound-engineering/config.yaml` and `config.local.yaml` (CE plugin 3.30.3 `skills/ce-brainstorm/scripts/packs-resolve.py:4-5,78`); there is no user-wide or org-wide layer.
- A git source needs `ref:`; `pack:` omitted means every pack the source publishes (`packs-resolve.py:32-42,600-601`). A cached git source is not fetched again, so a branch ref "freezes at its cached resolution per machine" (guide; `:298-300`). A `pack:` id the source does not publish drops the whole entry (`:609-613`). The same id in both layers keeps the team's (`:713-720`).
- Packs reach `ce-code-review` only on its full path ("local reviews only — remote-PR scope skips your local config", guide); a CI-workflow diff can still take the focused path, which loads no pack (ce-code-review `references/modes-and-output.md:70`, `depth-paths.md:30`).

So no placement makes R1 load where the config does not name its pack, or on a focused-path review. "Available in every turbo repository" means: published where any turbo repository can enrol it alone, without also loading `ci-wall-clock`.

**Consumers** (contents API, 2026-10-12; public repositories only, since this plan is public): 10 public `systemfsoftware` repositories have a root `turbo.json` and are not archived. Four declare packs, all from this repository: this one through live repo-relative paths; `stryker-js-effect` through three `tree/main` URLs without `package-topology`; `api-extractor-effect` and `are-the-types-wrong-effect` at pinned commits. Six declare none.

| Option                               | Reached with no new entry                | Against it                                                                                                                                                                                                                                                                                   |
| ------------------------------------ | ---------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| A: `ci-wall-clock`                   | 1                                        | enrolling it elsewhere breaks the systemfsoftware-only constraint                                                                                                                                                                                                                            |
| B: `package-topology`                | 3 (this repo live; 2 after a `ref` bump) | its subject is "What a published package's public surface may contain and how it may change" (`a578c704a4:compound-packs/package-topology/README.md:3`); a CI selection and caching rule is outside it (CONST-N1), and every consumer of that pack would read it whether or not it has turbo |
| C: new `turbo-task-graph`            | 1 (this repo)                            | 9 public consumer entries to reach the rest                                                                                                                                                                                                                                                  |
| D: machine-local `config.local.yaml` | one machine                              | invisible to every other machine and to remote-PR review; the same id in both layers drops the local one                                                                                                                                                                                     |

**Ruling: C.** B wins on reach today (3 versus 1) and loses on scope: enrolment by "has a root `turbo.json`" is a test a reader can check (CONST-T12), and "already enrols `package-topology`" is an accident of history. The rollout is a separate unit; its constraints are in Appendix B.

### R1. `turbo-task-graph/selection-and-caching-go-through-turbo`

- **Rule:** In a repository with turbo, which tasks a CI or release job runs, which packages a change touched and which results are reused are decided by turbo (its task graph, its tasks' `inputs` and its cache; by default turbo selects per package, and per task only with `futureFlags.affectedUsingTaskInputs`, which turbo 2.11.5's schema carries); code beside turbo that does any of those is allowed only for a closed list of things turbo cannot do, each named in a comment.
- **Closed list:** artifacts no turbo task produces (Nix store paths, for example); a tool's own record finer than a task, such as a mutation tool's incremental report, which turbo cannot cache below a whole task (carried, never used to decide what runs); packing tasks into jobs by measured duration and splitting a package into shards (turbo 2.11.5's `turbo run --help` offers `--concurrency` and no shard or distribution option); finding the base commit.
- **Cache boundary:** a public repository carries `.turbo/cache` through the host CI cache with no credential or cloud account; a remote cache is for private or fleet repositories, read-only for pull requests (`--cache=local:rw,remote:r`; Turborepo's support policy, https://turborepo.com/docs/support-policy: "`--remote-cache-read-only`: Use `--cache=local:rw,remote:r` instead."). In this org the boundary is owned by `ci-wall-clock/flake-outputs-build-once-on-main`, linked by URL so it reads where `ci-wall-clock` is not loaded.
- **Evidence step:** a change for build speed, cache misses, task scope or the task graph shows, where it is reviewed, the `turbo query` output for the range it changes (`affectedTasks` or `affectedPackages`, and `boundaries` where a dependency is at issue), per the `turbo-query-optimization` skill; a statement that turbo was consulted is not evidence.
- **History:** a selection runs on a checkout holding the history the base reaches; turbo counts every package changed on a checkout too shallow to reach it.
- **What it adds over `ci-wall-clock`:** `pr-gate-runs-only-what-the-diff-affects` already forbids a pull-request job choosing from a hand-kept package or path list. R1 keeps that ban and covers main, dispatch, release and changeset lanes, caching and task `inputs`, in repositories without `ci-wall-clock`.
- **applies_when:** changing `turbo.json` (a task's `inputs`, `outputs`, `cache`, `env` or `dependsOn`, or `globalDependencies`); adding or changing a CI step that decides which turbo tasks or packages run, or restores, saves or serves turbo's cache; adding or changing a script, action or tool setting that classifies changed files, lists affected or touched packages, records passed task hashes or skips work on any signal other than turbo's; working on a slow build, cache misses, CI task scope or the task graph in a repository with turbo.
- **tags:** `[turbo, ci, caching, affected, task-graph, inputs, workflows]`
- **Check question:** Does the diff add or change a way of deciding which tasks run, which packages a change touched or which results are reused that is not turbo, outside the closed list or without its comment; does a cache step let a pull request write a cache main reads, or put a remote-cache credential in a public repository; does a selection run on a checkout too shallow to reach its base; does a change made for speed or scope show its `turbo query` output?
- **Incidents (overfit gate: two repositories):**
  - **I3 (WRONG, this repo, 2026-10-09):** the Mutation planner packs "every package that has the --task script" (`8d07118079:scripts/tools/test-timings.ts:6-7`; invoked at `.github/workflows/reusable-mutation.yml:117-118` with no turbo selection). Runs `37952058012` (`d204dfb27c`, #695) and `37980363240` (`e8dc041ba0`, #697) judged vendor-only commits with 21 mutation jobs each, 337 and 340 job-minutes across the run; `turbo query affectedTasks(base: "<c>^", head: "<c>", tasks: ["mutation"])` returns 0 for both.
  - **I4 (WRONG, public `stryker-js-effect`, 2026-10-10):** its Mutation workflow runs on every push to main outside a hand-kept `paths-ignore` list against a fixed four-project corpus (`ee2c4cfb03:.github/workflows/mutation.yml:4-9,36`), and calls the kill matrix on the same push (`:361-366`). At `ee2c4cfb03`, a commit changing docs, workflows and `scripts/change-lane.ts`, run `38044574382` took 46 jobs and 183 job-minutes (20 mutation shards, 23 kill-matrix jobs); `turbo query` there gives one affected task (`//#typecheck:node`) and no task of any corpus package.
  - **I2 (corroborating, this repo, 2026-10-12):** `classify-diff` (`8d07118079:.github/actions/classify-diff/action.yml:1-4`) logged `scope=full reason=outside-docs path=".compound-engineering/config.yaml"` for #742's head (run `38299939711`, job `114980619302`), and the full gate ran; `affectedTasks(base: "02bf9653b1", head: "99f1331a8f")` returns 0. This already violates `pr-gate-runs-only-what-the-diff-affects`.
  - **Debated, not cited:** `pnpm-release-management`'s changeset gate has `strategy: 'paths' | 'turbo'` (`b9b4a1d:packages/changeset-engine/src/gate-changes.ts:35,71-74`), and four public turbo repositories set `paths`. Its `turbo` strategy compares the `build` hash, which ignores a package README that npm publishes. This repo's changeset gate keys on `#build` by a recorded decision (`docs/solutions/tooling-decisions/changeset-requirement-keys-on-turbo-build-hash.md`), so R1 states only that such a gate reads a turbo task hash, never a path list, and links that decision as the owner of which hash. Another unit owns the tool.
  - **Refuted:** a private infrastructure repository's own CI scripts build, push and collect Nix store paths, and it has no root `turbo.json`. That is the closed list's first entry.
  - **Turbo coverage checks:** test-timings' recorder reads turbo's own run summaries (`scripts/tools/test-timings.ts:11-12`) and keeps a cross-run duration history turbo has no field for, so the recorder and its packing are on the closed list. Its passed-hash skip record (`:276-293`) is not: turbo's cache can carry the same results if one job after the parallel jobs merges their `.turbo/cache` directories into one save on main (parallel jobs never share a save key: a key is written once, `.github/AGENTS.md:17`), which needs no credential (Appendix A).
- **WRONG/RIGHT:** WRONG is I4 (another repository, so the rule does not read as this repo's layout); RIGHT is a neutral shape whose planner asks turbo for the affected tasks, packs only those with a comment naming packing, and runs nothing when turbo selects nothing.

### R2. `ci-wall-clock/local-gate-equals-pr-gate`

- **Rule:** The command run before pushing is the PR gate's own definition: the same tasks, the same depth profile, the same tree preconditions and the same projects (a project the host cannot run, such as one needing `/dev/kvm`, names the missing capability instead of passing), with only resource knobs (worker counts, concurrency) free to differ; a diff that adds a task, profile or environment switch to one side fixes the other in the same diff.
- **Scope:** main-only depth is outside the equality (`heavy-suites-judge-every-main-commit`). The PR gate is the reference.
- **Incidents:** #510 above (WRONG, fixed). Live: `8d07118079:package.json:19,26` — `check:local` runs `gate:local`, whose task list lacks the `attw` that the PR's `gate:tasks` runs (`:17,25`); `.github/AGENTS.md:10` documents `pnpm check:ci` as "everything reusable-checks.yml runs" while root `AGENTS.md:67` (REPO-D1) names `pnpm check:local`. `1c78b6959b`: a stale `dist/` failed `dts:check` locally "while CI, building from an empty tree, stayed green". `docs/solutions/logic-errors/agent-outranks-ci-run-depth.md:138`: "An agent's green `check:local` is not evidence for CI's configuration".
- **RIGHT:** two public repositories run one definition: `pnpm-release-management` (`b9b4a1d:CONTRIBUTING.md:17`, "Run the same commands locally that CI runs; `pnpm check:ci` is all of them") and `stryker-js-effect` (`33c6175f:CONTRIBUTING.md:50`).
- **applies_when:** changing a root gate script (`check:*`, `gate:*`) or the command an agent instruction file tells an agent to run before pushing; adding or removing a task, profile or environment switch in a pull-request gate job; adding a check that runs only in CI or only locally.
- **tags:** `[ci, gates, local, presubmit, agents, workflows, wall-clock]`
- **Check question:** Does the diff make the PR gate run a task, depth profile, environment switch or tree precondition that the documented local command does not, or the reverse, or define the local command apart from the PR gate's?
- **Conflict C1:** REPO-D1 names `check:local`; the fix (make `check:local` call the PR gate, or name `check:ci`) belongs to the shared-tooling unit or the root, not this pack.

### R3. `ci-wall-clock/failures-name-the-gate-and-location`

- **Rule:** A failing CI job ends by writing which gate failed as a reason code from a closed set, the failing step (and the package or shard where the job runs per package), and a command that reproduces it from the workspace root; no verdict step's failure is swallowed, a cancelled or timed-out job is named by its own summary and by the job that reports the others, and "read the log" is never the reproduce command.
- **Owner in place:** `.github/AGENTS.md:42` and `.github/actions/failure-summary/action.yml:3-4,15-16,72-78,84` write the reason code, reproduce command and job id for this repo's reusables; the action prints failed step ids only in its catch-all (`:69-70`) and reads only `failure` outcomes (`:41,44`). R3 cites them and extends the duty to every CI-facing job and to the timed-out case.
- **Incidents:** WRONG (fixed): `e73c526331:.github/workflows/mutation.yml:57-64`, a verdict step under `continue-on-error: true` (the 2026-08-10 plan's green-but-dead runs). WRONG (live): `8d07118079:.github/workflows/reusable-checks.yml:214,712` and `reusable-nix.yml:68`, reproduce `gh run view … --log-failed`. RIGHT: `reusable-checks.yml:574` (the package filter or exact shard), and public `stryker-js-effect` `33c6175f:.github/workflows/ci.yml:176` ("Turbo task failed: ${failed}. Reproduce with: pnpm exec turbo run ${failed}").
- **applies_when:** adding or changing a CI job or a verdict step; adding `continue-on-error`, `|| true` or an `if:` that can let a verdict step's failure pass; changing a failure summary, its reason table or its reproduce command.
- **tags:** `[ci, failures, diagnostics, reproduce, workflows, wall-clock]`
- **Check question:** Does a job the diff adds or changes end, on failure, without a reason code from a closed set, the failing step (and package or shard where it has one, or the failed jobs where it only reports them) and a local reproduce command (for a reporting job, the whole gate's local command), or does a verdict step it touches let its failure pass?

### R4. Red-main's precision claim (ruling, open to debate)

Two hypotheses were tested.

- **A:** derive the rerun count k from the lane's seven-day per-job flip rate f, the smallest k with f^k(1-f) < 1%, and k = 1 when f < 1%.
- **B:** drop the >99% precision claim.

Evidence:

- **What SafeRevert's 99% is.** "safety can either be stated in terms of precision (ex. precision must be above 99%) or in terms of bad revert rate (ex. bad revert rate must be below 1%). In this evaluation we will consider a method safe if its bad revert rate is below 1%, there are fewer than 14 bad reverts in the final validation set" (https://hackthology.com/saferevert-when-can-breaking-changes-be-automatically-reverted.html). It is a rate measured over a held-out validation split of a dataset of "∼ 25,137 unique changes identified by the production culprit finder as culprits", reached by a trained model on top of a culprit finder that "has a measured per-test accuracy of 99.54%". No per-revert rule meets it by construction.
- **What A bounds.** f^k(1-f) is the chance that a code-independent red passes conditions (c) and (d). Precision also needs the share of reds that are code-independent. Micco: "about 84% of the transitions we observe from pass to fail involve a flaky test" (https://testing.googleblog.com/2016/05/flaky-tests-at-google-and-how-we.html). With that share and a 1% bound, precision is about 1/(1 + 0.01 x 84/16) ≈ 95%, not 99%.
- **What this repo can measure.** The jobs API for the 76 main push CI runs from 2026-10-05 to 2026-10-12 holds 952 first-attempt job executions, 5 failures, and one rerun run whose 3 rerun jobs stayed red: no flip observed. f cannot be estimated from that. Its upper bound (every failure flaky) is 5/952 ≈ 0.5%, which already gives k = 1, the current rule. Mutation now runs on dispatch only (`origin/main:.github/workflows/mutation.yml:3-4`), so its f has no source at all.
- **Cost.** A adds a seven-day jobs-API computation to the handler, and k reruns per failing job on heavy lanes (I3's runs average about 16 job-minutes per mutation job).

**Ruling: B, with the bound stated.** The rule keeps its five conditions and drops any claim that they meet SafeRevert's bar. Its grounds say what SafeRevert's 99% is, that one rerun cannot establish it, what conditions (c) and (d) do bound (f(1-f) for a code-independent red), and why a wrong revert is tolerable here: it is a pull request merged only through the gate, and the P0 names an owner who can close it. A is rejected because it would replace one unestablished precision claim with another, at a cost.

### Ownership and conflicts

- Owned elsewhere, cited not restated: affected-only scope and base choice (`pr-gate-runs-only-what-the-diff-affects`); push-run scope (`heavy-suites-judge-every-main-commit`); the cache boundary and Nix artifacts (`flake-outputs-build-once-on-main`); one turbo invocation per gate job (`gates-share-one-job`); per-lane cache keys (`.github/AGENTS.md:17`); complete input hashes (`docs/solutions/tooling-decisions/turbo-cache-requires-complete-input-hash.md`); the reusables' failure contract (`.github/AGENTS.md:42`).
- C1 (R2 vs REPO-D1) and C2 (R2 vs the documented agent depth, `agent-outranks-ci-run-depth.md:138`) are named in R2's file and left to the root and the shared-tooling unit.

### Debated points carried from the earlier draft, with the defaults applied

- **Public turbo cache shared by parallel jobs (DF1):** a GitHub-cache-backed remote-cache shim (`rharkor/caching-for-turbo`, "No need for Vercel account or tokens") is not adopted; R1 states the boundary only, and Appendix A carries the merged-cache shape.
- **Classifier scope (DF2):** R1 condemns a classifier only where it decides turbo tasks; a classifier gating non-turbo lanes is outside it.
- **Agent depth (DF3):** only resource knobs may differ; a lower depth profile for agents is a divergence.
- **Location field (DF4):** the failing step, plus the package or shard where the job runs per package; no file:line.
- **Link versus restate (DF6):** link by URL.
- **Enrolment check (DF7):** no gate in this unit (GATE1).
- **Overfit (DF8):** met by I3 and I4 in two repositories.

### Scope boundaries

- In: the files listed under Delivery.
- Out: `.github/`, `scripts/`, `package.json`, `AGENTS.md` and `.github/AGENTS.md` edits; any gate or lint rule; consumer enrolment; any other repository; any change to `ci-wall-clock`'s enrolment.

### Success criteria

- A reviewer answers each check question from a diff alone, using the rule file.
- Every citation is `<repo> <sha>:<path>:<line>` in a public repository and resolves at that SHA; every run id belongs to a public repository.
- The resolver loads `turbo-task-graph` beside the eight existing packs with no error or warning.
- The full-path receipt lists every declared pack by id and each matched pack rule's and constitution law's disposition, with a blind MiniMax or DeepSeek peer named by model.

## Units

| U  | Files                                                                                               | Depends on |
| -- | --------------------------------------------------------------------------------------------------- | ---------- |
| U1 | `compound-packs/turbo-task-graph/README.md`, `selection-and-caching-go-through-turbo.md`            | none       |
| U2 | `compound-packs/ci-wall-clock/local-gate-equals-pr-gate.md`                                         | none       |
| U3 | `compound-packs/ci-wall-clock/failures-name-the-gate-and-location.md`                               | none       |
| U4 | `compound-packs/ci-wall-clock/red-main-reverts-its-culprit-same-day.md` grounds and confidence text | none       |
| U5 | `compound-packs/ci-wall-clock/README.md`: two index lines and the `turbo-task-graph` cross-link     | U1-U3      |
| U6 | `.compound-engineering/config.yaml`: the `turbo-task-graph` entry                                   | U1         |

U6 waited for #746 (`packs/ui-state`), which also appended to `.compound-engineering/config.yaml`; with #746 merged into `main` and `main` merged into this branch, the entry follows `ui-state`.

## Tests and verification

- **Permanent tests: none admitted.** The change is pack text, which `test-layer-selection` places in no test cell, and OP12 admits tests only for a functional contract, a pure decision or a regression. Every check below is a throwaway run whose output goes in the PR body.
- **Pack format:** frontmatter keys `{title, applies_when, tags}`, one `## Rule`, last line starting ``Gate: `review`.`` for each changed rule file.
- **Citations:** every `<repo> <sha>:<path>:<line>` resolved with `git show` here or a clone of the other public repository, with the quoted lines matched.
- **Exemplars:** each RIGHT and WRONG YAML block that is a job passes actionlint with shellcheck, wrapped as a workflow, and every tool a RIGHT calls exists in the environment it prescribes.
- **Loading:** `packs-resolve.py` on the committed config returns every declared pack, `turbo-task-graph` among them, with no error or warning.
- **Repo gate:** `pnpm check:local` after the last edit.
- **Review:** `ce-code-review mode:agent base:origin/main depth:full`, with a blind peer on MiniMax or DeepSeek named by model; no Grok or xAI route.
- **Privacy:** a whole-word, case-insensitive grep for every private repository name, plus private account namespaces, counts of private repositories, private paths, PR numbers and run ids, over the changed files, the commit messages and the PR body, before each push and before reporting.
- **CI:** watched with `run_watch` to green on the final head.

## Assumptions challenged (destructive review, Scope Challenge lens)

1. "Placing the rule in a pack consumers already enrol distributes it." Broken: packs are declared, never scanned, and three of the four public declaring repositories pin a commit or a frozen branch, so any placement reaches them only after an edit in each.
2. "Turbo can always replace a hand-kept classifier." Partly broken: turbo selects per package by default, so in `stryker-js-effect` the docs-only commit `1b3e60fc` selects `//#typecheck:node` with reason `TaskAllChanged` although that task's `inputs` do not match it, and a `build`-hash gate misses a published README. Turbo replaces a docs classifier only with `futureFlags.affectedUsingTaskInputs` plus task `inputs` that exclude docs; R1 names that remedy, not a bare `--affected`. (The earlier draft said the task's `inputs` include docs; turbo's own reason code refuted it.)
3. "A rerun count can buy SafeRevert's precision." Broken: precision depends on the share of reds that are flaky, which no per-red rerun count measures (R4).

Wiki probe (the operator's knowledge-base search, 2026-10-12): lex `turbo affected cache "remote cache" CI` and two semantic queries on automatic reverts and local-versus-PR gates returned no results.

## Appendix A. Live candidates for the shared-tooling unit (at `8d07118079`)

| Rule | Location                                                                               | Shape                                                                                        |
| ---- | -------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| R1   | `.github/workflows/reusable-mutation.yml:117-118`, `scripts/tools/test-timings.ts:6-7` | plans every package carrying `mutation`; ask turbo for affected tasks first                  |
| R1   | `scripts/tools/test-timings.ts:276-293`                                                | passed-hash skip record; replace with turbo's cache, merged into one save on main by one job |
| R1   | `.github/actions/classify-diff/action.yml`                                             | path classifier deciding turbo tasks (I2)                                                    |
| R2   | `package.json:19,26` vs `:17,25`                                                       | `check:local` lacks `attw` that the PR gate runs                                             |
| R3   | `.github/workflows/reusable-checks.yml:214,712`, `reusable-nix.yml:68`                 | reproduce is a log link                                                                      |

## Appendix B. Consumer actions outside this unit

| Repository                                                     | Action                                                                                                                                                               | Why                                                                                                          |
| -------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| `are-the-types-wrong-effect` (public)                          | list the packs it loads today instead of omitting `pack:`, before any `ref` bump past `8d07118079`                                                                   | an unfiltered entry would load `ci-wall-clock` and widen it                                                  |
| each turbo repository that opts in (9 public besides this one) | in one commit, bump `ref` to a full commit SHA that publishes `turbo-task-graph` and add its id; never a `tree/main` URL; show the resolver's roots before and after | packs are declared, never scanned; an unpublished id drops the whole entry; a branch ref freezes per machine |
| `stryker-js-effect` (public)                                   | I4's mutation lane                                                                                                                                                   | not this unit                                                                                                |

## Appendix C. Evidence and unverified premises

- **turbo-query-optimization run (2026-10-12):** schema captured and its surface extracted in both repositories (turbo 2.11.5, root fields `affectedPackages`, `affectedTasks`, `boundaries`, `packageGraph`, `packages` among them); this repo 50 packages, 347 edges, 1 boundary diagnostic; `stryker-js-effect` 25 packages, 104 edges, 20 boundary diagnostics; affected-task counts as cited above.
- **Consumer data:** read through the contents API; only public repositories are counted in this plan.
- **Reviews of the draft:** a blind DeepSeek V4.1 Flash pass (11 findings), an adversarial counter-review ("C holds with changes") and two fresh-context claim checks (0 refuted). Their fixes are in this text.
- **Unverified:** the intended meaning of the two root-named slugs beyond their names; repositories this token cannot see; whether a `paths`-strategy decision has yet caused a wrong release.
