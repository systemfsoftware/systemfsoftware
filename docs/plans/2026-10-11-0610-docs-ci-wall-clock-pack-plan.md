---
title: The ci-wall-clock compound pack - Plan
type: docs
date: 2026-10-11
artifact_contract: ce-unified-plan/v1
product_contract_source: ce-brainstorm
execution: code
---

# The ci-wall-clock compound pack - Plan

## Goal Capsule

- **Objective:** whoever plans or reviews a CI-facing change in a systemfsoftware repo judges it against one set of wall-clock rules with stable ids. Under those rules a pull request gets a fast verdict on what it affects, every push to main gets its own heavy verdict, and a red main is reverted or fixed the same day.
- **Means:** a new compound pack `compound-packs/ci-wall-clock/` (a README plus eleven rule files) in the exact format of the six existing packs, enrolled in this repo's `.compound-engineering/config.yaml` (KD1, KTD1).
- **Authority:** the owner's brief ("this is worthy of a new compound pack. the current long CI mockery we have in all repos is extremely problematic"), the sub-conductor's and root's rulings of 2026-10-11, under `CONSTITUTION.md` and the root `AGENTS.md`. A separate shared-tooling unit implements these rules in the reusable workflows and cites this pack's ids; it is not active scope here.
- **Stop conditions:** pack text, the config line and this plan only. No edit under `.github/`, no gate or lint rule, no change in any other repo, no repo or org settings change.
- **Execution profile:** docs-only change delivered as one pull request; verification is reading each rule's check question against its own cited lines, the pack loader, the privacy grep and `pnpm check:local`.
- **Finishes and ships:** the ce-work executor opens the PR, runs the full ce-code-review, puts its rulings in the PR body and watches CI to green. The operator merges.
- **Open blockers:** none. The root closed Q5 and Q7 at the plan gate (2026-10-11).
- **Evidence (git-excluded, host-mounted):** `.ci-evidence/brainstorm/measurements.md`, `ownership.md`, `incidents.md`, `prior-art.md`, `revert-credentials.md`, `repo-jobs.md`, `claim-verdicts.md`, `visibility.txt`. Workflow lines were read with `git show origin/main:<path>` at origin/main `02bf9653b1` unless another SHA is named. `incidents.md` names private repos and is never quoted from. No rule file cites `.ci-evidence/`.

---

## Product Contract

### Summary

Add a compound pack of eleven review rules for CI-facing changes. Each rule file carries a stable id, a one-sentence rule, a harm taken from a real incident in this org, a WRONG/RIGHT pair cited as `<repo> <sha>:<path>:<line>`, and a closing `Gate:` line whose check question a reviewer answers from the diff alone. Numbers the diff cannot show (job wall time, setup seconds, PR gate total, daily runner-minutes) live in each run's step summary or in a header comment on the lane, and the rule checks the diff-visible shape that produces them.

### Problem Frame

CI in this org is slow and its main verdicts are unreliable. Measured in this repo and the public org repos:

- A kill cap hid a cause. Five Mutation runs on main in this repo were killed at 30 minutes, for example `systemfsoftware/systemfsoftware` run `35938446772`: "The job has exceeded the maximum execution time of 30m0s" (`systemfsoftware/systemfsoftware e08764fb8f:.github/workflows/mutation.yml:91`, `timeout-minutes: 30`).
- Main went red and stayed red. The Mutation lane on main failed from 2026-09-25 to 2026-10-09: 95 runs, 60 failed, 34 cancelled, 1 passed, 372 runner-hours spent. It ended when #700 switched the push trigger off rather than fixing the cause.
- Main cancels its own verdicts. `ci.yml:10-12` groups by ref with `cancel-in-progress: true`, so `systemfsoftware/systemfsoftware` run `36047298397` was cancelled after 40 minutes, the next run was cancelled too, and the third failed. Main stayed red 3.7 h with no verdict on the first two commits. In `systemfsoftware/stryker-js-effect`, a main-side `cancel-in-progress: false` with no `queue` still replaced pending runs with zero jobs started (runs `38072120191`, `38073244833`, `38073356143`).
- Setup dominates. A public repo's PR lanes spend 559-714 s entering a Nix dev shell before gates that take 9-262 s (`systemfsoftware/effect-endgame-starter-kit` run `37919809442`). A commitlint job here needs a producer job plus a workspace install to lint one commit message.

No existing law owns these rules (`.ci-evidence/brainstorm/ownership.md`), and existing doctrine contradicts some of them (Appendix B).

### Key Decisions

- KD1. **Eleven rule files grouped by outcome, not one file per brief item.** R6 and R7 of the brief overlap, so they regroup into a PR-gate rule, a postsubmit rule, a red-main rule and a release rule. Governs R8-R18. (session-settled: user-approved - chosen over a 1:1 split of twelve or more files: less overlap between files)
- KD2. **Rule id = `ci-wall-clock/<file slug>`.** A slug is never renamed, and a retired rule is deleted outright, with its id never reused. Governs R2.
- KD3. **The workflow decides and the patrol opens the revert PR.** The postsubmit workflow attributes the culprit, judges confidence and files the P0 with `GITHUB_TOKEN`; a user credential opens the revert PR. Governs R15. (session-settled: user-directed - chosen over a workflow-opened revert PR: it depends on an unverified per-repo setting and turning it on is a forbidden settings change)
- KD4. **Every push to main gets its own completed heavy verdict.** Batching and bisection are out of this pack. Governs R14, R15. (session-settled: user-directed - chosen over TAP-style batching: per-commit verdicts make culprit attribution and the automatic revert sound)
- KD5. **Measured rules check the diff's shape; the number lives in the run.** Governs R9, R13, R17.
- KD6. **No separate accessibility lane stays in this pack, inside the PR-gate rule.** Governs R13. (session-settled: user-directed - chosen over citing storybook-testing alone: that loses half of the brief's R9)
- KD7. **Push runs are scoped from the lane's last green main commit, not the full corpus.** Governs R14. (session-settled: user-directed - root ruling 2026-10-11, chosen over a full corpus on every push, about 3,500-4,500 runner-min/day with 31-min jobs, and over a scheduled daily full corpus)
- KD8. **Flake artifacts are built once on main, keyed on their inputs, and restored read-only everywhere else; how they are stored depends on repo visibility.** A public repo carries no credentials and no cloud wiring in CI and stores them in the host CI's own cache or artifacts. A private repo on the fleet's runners stores them in an in-region S3 substituter with signed push from main. Governs R12. (session-settled: user-directed - root ruling 2026-10-11, chosen over the brief's single fleet-cache rule: a public repo carries no credentials and no cloud accounts in CI)
- KD9. **The coding agent's pre-PR UI evidence is not a rule in this pack.** Compound Engineering's ce-test-browser stage owns it, and the README names that stage beside the other owners (R4). Governs R4, R21. (session-settled: user-directed - root ruling at the plan gate 2026-10-11, chosen over a rule file of its own: sandbox UI evidence is not a CI wall-clock rule, and no org incident was found for it, so it would not count under the contract)
- KD10. **The merge freeze is held at the merge decision.** Governs R15. (session-settled: user-directed - chosen over a ruleset or merge-blocking check: both are settings changes)

### Requirements

**Pack shape**

- R1. `compound-packs/ci-wall-clock/` sits beside the six existing packs, with one rule per file, in their exact format: the README shape, the frontmatter keys (`title`, `applies_when`, `tags`, nothing added), the prose `applies_when` style, the `## Rule` section, the WRONG/RIGHT code block with `<repo> <sha>:<path>:<line>` citations, and the closing line ``Gate: `review`.`` followed by the rule's check question. The models are `compound-packs/mutation-discipline/` and `compound-packs/storybook-testing/`.
- R2. Each rule's id is `ci-wall-clock/<slug>`. The slugs are exactly those of R8-R18, and the README lists them in the order R8-R18. The root approved these eleven ids at the plan gate, and they are frozen under KD2.
- R3. Each rule's `applies_when` names the changes that trigger it. Together R8-R18 cover changes to `.github/workflows/**`, to `.github/actions/**`, to CI-facing flake outputs (checks, CI packages, anything a workflow builds) and to runner configuration.
- R4. The README cites rules owned elsewhere and does not restate them, the way `compound-packs/mutation-discipline/README.md` does. Owners: fix at the cause (`CONSTITUTION.md` CONST-S1); tests of a shipped tool test the published surface (CONST-T8); what is affected is decided by what code is, never by its path (CONST-T12; `.github/AGENTS.md:36`); mutation never on a pull request and never local (`.github/AGENTS.md:21`, `AGENTS.md` REPO-D3); how axe runs inside a story (`compound-packs/storybook-testing/real-browser-axe-as-error.md`); release runs never cancel each other (`docs/solutions/tooling-decisions/pnpm-owns-the-changeset-ledger.md:109`); the coding agent's pre-PR UI evidence, gathered by using the built product the way its user does (Compound Engineering's ce-test-browser stage; KD9).
- R5. `.compound-engineering/config.yaml` enrols `compound-packs/ci-wall-clock`. No other repo is touched.
- R6. Each rule file states one rule sentence, a why from an incident in this org, one WRONG/RIGHT pair and a check question answerable from the diff alone. Every run id names the repo whose run it is. A rule with no public RIGHT exemplar shows the right shape as neutral code with no citation.
- R7. Only repos that `.ci-evidence/brainstorm/visibility.txt` lists as PUBLIC are named. A private repo's incident appears only as an unnamed pattern with a date, or is replaced by a public one. Nothing marked UNVERIFIED in the evidence is cited.

**The rules** (the rule sentence and check question are the normative text; the incidents are the required evidence)

- R8. `one-stuck-job-backstop`. Every job that runs steps sets `timeout-minutes: 60`, no job, step or tool invocation gets a shorter wall-clock kill, each such job writes its wall time to the step summary, and an overrun is fixed at its cause. A job that calls a reusable workflow carries no `timeout-minutes`; the callee's jobs carry the backstop and the summary.
  - **Check:** Does any non-caller job in the diff (a job with `runs-on`) set `timeout-minutes` to anything other than 60, or omit it? Does any step set one below 60, any command run under a wall-clock kill below 60 minutes (a `timeout N` wrapper, a runner's whole-run timeout flag, a lane-level cap handed to a tool such as a planner's `max-seconds`), or any such job leave its wall time out of the step summary? A `uses:` caller job without `timeout-minutes` passes. A per-test timeout inside a test framework is out of scope.
  - **WRONG:** `systemfsoftware/systemfsoftware e08764fb8f:.github/workflows/mutation.yml:91` (`timeout-minutes: 30`). `systemfsoftware/systemfsoftware` run `35938446772`, job `Mutation (packages/effect-readiness)`, was killed at 30m0s, and four more runs died the same way (`35887715884`, `35991344744`, `36010116451`, `36070566247`). The cause was one package concentrating too many mutants, later fixed by splitting it (`docs/solutions/architecture-patterns/mutation-budgets-split-rule-packages-into-private-cells.md`).
  - **RIGHT:** `systemfsoftware/systemfsoftware e9543bae65:.github/workflows/reusable-checks.yml:381` (`timeout-minutes: 60`, raised from 10 at `9d797f4c56`), whose commit is "give every job this branch adds the 60-minute stuck-job backstop". Also `systemfsoftware/gritlint 5c9c2ab:.github/workflows/mutants.yml:33`.
  - **Grounds:** GitHub, "Reusing workflow configurations", section "Supported keywords for jobs that call a reusable workflow" (https://docs.github.com/en/actions/reference/workflows-and-actions/reusing-workflow-configurations): "When you call a reusable workflow, you can only use the following keywords in the job containing the call", a list of `name`, `uses`, `with`, `secrets`, `strategy`, `needs`, `if`, `concurrency`, `permissions` and `cache-mode`.
- R9. `setup-under-a-minute`. A PR job reaches its first verdict step within 60 s: only checkout, one pinned tool fetch, a cache or substituter restore and a frozen install come before it, never a source build. A PR job may build an artifact without saving it in two cases only: its diff changes that artifact's inputs, or the restore of main's key misses (for example, after eviction). R12 cites these two cases.
  - **Check:** Does any PR-triggered job in the diff run a source build or a workspace bootstrap, or anything else beyond checkout, a pinned tool fetch, a restore and a frozen install, before its first verdict step? Building an artifact without saving it passes only in the two cases above.
  - **WRONG:** `systemfsoftware/pnpm-release-management 8cd6e83009:.github/workflows/changeset-check.yml:66-71` builds the release tools with `nix build` on every PR. In `systemfsoftware/systemfsoftware` run `38105407053`, this repo's caller run of that reusable, the step took 119 s of a 160 s job.
  - **RIGHT:** `systemfsoftware/systemfsoftware 02bf9653b1:.github/actions/install-deps/action.yml:17,27`: a Node runtime and `pnpm install --frozen-lockfile`, 17 s in `systemfsoftware/systemfsoftware` run `38113391870`. The citation shows only the setup shape; the job that ran it is condemned by R13.
- R10. `light-checks-run-the-pinned-tool`. A commit-message, changeset or PR-title check runs its pinned tool directly, with no workspace install, dev shell or producer job before it.
  - **Check:** Does a commit-message, changeset or PR-title job in the diff install the workspace, enter a dev shell, or `needs:` another job before running its tool?
  - **WRONG:** `systemfsoftware/systemfsoftware 02bf9653b1:.github/workflows/reusable-commitlint.yml:27-31,61,82-85`: a tarball producer job, then `needs: sfs-deps`, then `install-deps`, all to lint commit messages. Warm, that is 19 s plus 33 s (`systemfsoftware/systemfsoftware` run `38105406935`). Cold, the producer alone is 3m39s (`systemfsoftware/systemfsoftware` run `38096023335`).
  - **RIGHT:** `systemfsoftware/systemfsoftware 02bf9653b1:.github/workflows/changeset-check.yml:26-32`. The packed-manifest check runs the pinned Deno tool after `setup-deno`, with no install; the whole job takes 17 s (`systemfsoftware/systemfsoftware` run `38105407053`).
- R11. `no-dev-shell-on-verdict-lanes`. No lint, typecheck or test job enters a Nix dev shell.
  - **Check:** Does any lint, typecheck or test job in the diff run `nix develop`, a dev-shell action, or a command wrapped in one?
  - **WRONG:** `systemfsoftware/effect-endgame-starter-kit 375e468:.github/workflows/ci.yml:49,59`. In `systemfsoftware/effect-endgame-starter-kit` run `37919809442` every lane's dev-shell step took 559-714 s, while the gates took 9-262 s. The same repo's commitlint took 632 s in the shell for a 10 s check (`commitlint.yml:21-22`, run `37919809374`).
  - **RIGHT:** `systemfsoftware/systemfsoftware 02bf9653b1:.github/actions/install-deps/action.yml:17,27`: a Node runtime and `pnpm install --frozen-lockfile`, with no Nix.
- R12. `flake-outputs-build-once-on-main` (renamed from the draft slug `flake-outputs-substitute-from-the-binary-cache`, which named only the private case; the root approves ids at the plan gate). A flake artifact CI uses is built once on main, only when its inputs change, keyed on its input hash (for example the `flake.lock` narHash or the drvPath), written from main only, and restored read-only by every PR job, which never rebuilds an artifact main already built for the same inputs. A PR job builds it without saving only in R9's two cases: its diff changes the artifact's inputs, or the restore of main's key misses.
  - **Public repos:** CI carries no credentials and no cloud wiring: no OIDC role, no S3, no fleet substituter. The artifact lives in the host CI's own cache or artifacts. Main writes it; a PR job restores it through a restore-only form (`actions/cache/restore`, or `cache-mode: read` on the job).
  - **Private repos on the fleet's runners:** an in-region S3 substituter, signed push from main only, PR jobs read-only. Here an artifact never travels through `actions/cache` alone. The runners trust only the substituter's signing key, and only main pushes.
  - Neither case depends on any unmerged runner change.
  - **Check:** (1) Does a PR job build an artifact main already built for the same inputs (a build step outside R9's two cases)? (2) Does a public repo's workflow name a credential or a cloud role (`id-token: write`, a cloud login action, an S3 or substituter secret)? (3) Does a PR job write the artifact through an `actions/cache/save` step, a substituter push, or a job without `cache-mode: read` (set at job or workflow level) whose steps save, or, in a private fleet repo, carry it through `actions/cache` with no substituter configured?
  - **WRONG:** `systemfsoftware/systemfsoftware 02bf9653b1:.github/actions/sfs-deps/action.yml:94-95` saves the tarball cache on a miss from any event, pull requests included, and `.github/workflows/reusable-checks.yml:379-390` and `reusable-commitlint.yml:27-31` each run their own producer of the same key. #735's body: "A caller that runs several of these reusables in one run can build once per call on a cold cache." The cold build takes 3m39s (`systemfsoftware/systemfsoftware` run `38096023335`).
  - **RIGHT:** neutral shapes, no citation. Public: a `push`-to-main job keys the artifact on its drvPath (or the `flake.lock` narHash), restores, builds only on a miss and saves with `actions/cache/save`; each PR job declares `cache-mode: read` and restores the same key with `actions/cache/restore`, building without saving only in R9's two cases. Private fleet: the runner trusts the substituter's signing key, a main-only job pushes signed paths after building, and PR jobs only substitute.
  - **Grounds:** GitHub, "Dependency caching reference", section "Restrictions for accessing a cache" (https://docs.github.com/en/actions/reference/workflows-and-actions/dependency-caching): "Workflow runs can restore caches created in either the current branch or the default branch (usually `main`). If a workflow run is triggered for a pull request, it can also restore caches created in the base branch", and "When a cache is created by a workflow run triggered on a pull request, the cache is created for the merge ref (`refs/pull/.../merge`). [...] It cannot be restored by the base branch or other pull requests targeting that base branch." The same page, section "Controlling cache access with `cache-mode`", gives `read` as "Restore caches: Yes, Save caches: No", and recommends "a restore-only cache operation such as `actions/cache/restore`". A PR write is therefore wasted for every other run, which is why only main writes.
- R13. `pr-gate-runs-only-what-the-diff-affects`. The PR gate runs only what the diff affects, decided from the build graph: lint and typecheck, property tests, public-API feature tests with IO emulated, and the changed Storybook stories with their interaction, a11y and visual checks. It fits in 10 minutes, and no CI job has accessibility as its only subject outside the story run.
  - **Check:** Does a PR-triggered job in the diff run something the diff does not affect, decide what is affected from a path instead of the build graph, run a heavy suite (full-stack e2e, full corpus, mutation), or have accessibility as its only subject outside the story run?
  - **WRONG:** `systemfsoftware/systemfsoftware 02bf9653b1:.github/workflows/ci.yml:86-103`. The real-microVM journey smoke runs on every pull request that is not docs-only (`:89`), whatever it changed. Also unnamed: a private product repo runs a separate accessibility journeys lane under a Nix e2e shell (org inventory, 2026-10-11).
  - **RIGHT:** the graph-based skip `.github/AGENTS.md:36` describes ("The test planner skips a package whose turbo hash a remote cache or a passed run already holds, and nix builds only outputs whose `drvPath` differs from the base commit's"), implemented at `systemfsoftware/systemfsoftware 02bf9653b1:.github/workflows/reusable-checks.yml:126,272-273` (the PR's turbo dry run) and `reusable-nix.yml:105,129` (the `drvPath` comparison). PR CI wall time was 2.8-4.7 min over five `systemfsoftware/systemfsoftware` runs (`38113391870`, `38113206446`, `38112410726`, `38108809753`, `38107172888`).
  - **Grounds:** _Software Engineering at Google_ ch. 23 (https://abseil.io/resources/swe-book/html/ch23.html): "only fast, reliable ones". Google Testing Blog, "Efficacy Presubmit", 2018-09-17 (https://testing.googleblog.com/2018/09/efficacy-presubmit.html): "a 'missed failure' at presubmit is not a critical failure. The test will still be run at continuous build, and then rolled back if it fails."
- R21. Not a rule in this pack (root ruling at the plan gate, 2026-10-11; Q5). The coding agent's pre-PR UI evidence is owned by Compound Engineering's ce-test-browser stage, which the README cites under R4. No file ships for it, and its draft slug is not an id.
- R14. `heavy-suites-judge-every-main-commit`. Full-stack e2e, full-corpus and mutation lanes run postsubmit on every push to main: each push gets its own completed run, and a commit is judged by the run that covers it. They never run in or block a pull request, and no later push cancels or replaces an earlier push's run.
  - **Concurrency:** on main, either a group keyed by the commit, or one fixed main-side group with `queue: max` and `cancel-in-progress: false`. PR refs keep `cancel-in-progress: true`.
  - **Scope:** a push run tests the diff from the lane's last green main commit to this commit, after checking that commit is an ancestor of this one. The full corpus runs only on `workflow_dispatch`, when the lane's own inputs change (its workflow file, its config, its tool pin), and as the fallback when no green ancestor is found, so a run never under-tests. No scheduled full corpus.
  - **Sharding:** shard sizes come from measured timings so each job takes about 10 minutes or less. That target is reported in the step summary and is never a timeout; R8's 60 stays the only timeout.
  - **Check:** Does a heavy lane in the diff run on `pull_request`, skip a push to main, or let a later main push cancel or replace an earlier one (cancel-in-progress true on main, or a group shared across main commits without `queue: max`)? Does it set PR refs to anything but cancel-in-progress true, scope a push run from anything but a last green ancestor on the same lane, omit the full-corpus fallback, schedule a full corpus, or size shards by anything but measured timings?
  - **WRONG:** `systemfsoftware/stryker-js-effect 815754693e:.github/workflows/mutation.yml:27-28` sets cancel-in-progress false on main with no `queue`. `systemfsoftware/stryker-js-effect` run `38072120191` was replaced while pending, with zero jobs started, the second the next push arrived. This repo's lane at `systemfsoftware/systemfsoftware e08764fb8f:.github/workflows/mutation.yml:6-7,10-12` also ran on `pull_request` and cancelled main runs in progress; before #700 removed the push trigger, its push runs ran the whole lane every push (`systemfsoftware/systemfsoftware` runs `37962737026`, `37952058012`, `37946043552`, `37925930619`: 422, 337, 370 and 324 job-min, 23 jobs each, the longest job 31 min; verified by the root and sub-conductor, 2026-10-11).
  - **RIGHT:** concurrency, `systemfsoftware/gritlint 5c9c2ab:.github/workflows/mutants.yml:19-20`: `group: mutants-${{ github.event_name == 'push' && github.sha || github.ref }}`, `cancel-in-progress: false`. Scope and sharding, a neutral worked example with no repo or run named in the pack: an incremental mutation lane's full run cost 234 job-min in 55 jobs (53 shards plus 2 control jobs), longest shard 7m08s; an in-diff run of the same lane cost about 10 job-min in 4 jobs, longest 4m29s. The neutral worked example is labelled by shape, not by trigger: it calls the scoped run "an in-diff run" and never attributes its numbers to a repo's push runs.
  - **Grounds:** GitHub, "Control the concurrency of workflows and jobs" (https://docs.github.com/en/actions/how-tos/write-workflows/choose-when-workflows-run/control-workflow-concurrency): "By default, any existing `pending` job or workflow in the same concurrency group will be canceled"; "`max`: Up to 100 jobs or workflow runs can be `pending` in the concurrency group"; "The combination of `queue: max` and `cancel-in-progress: true` is not allowed". Henderson et al., "Taming the Variants", ICST 2026 (https://hackthology.com/taming-the-variants-multi-architecture-continuous-testing-at-google.html): "TAP Presubmit does not conduct exhaustive testing. Instead, it operates in a 'best-effort' mode". "Efficacy Presubmit": "Continuous build will execute tests even when they have already passed at presubmit."
  - **Departure from TAP, stated in the rule file:** the same paper says "While it originally ran the _affected_ tests (based on the build graph) at every single change [...], this quickly proved too expensive. Today, Postsubmit runs periodically". This pack keeps the per-change verdict because its scale allows it: 10.7 pushes/day (R17) times about 10 job-min per in-diff run is about 107 job-min/day, against about 3,500-4,500 runner-min/day for whole-lane runs.
- R15. `red-main-reverts-its-culprit-same-day`. On the day a postsubmit verdict goes red, it names its culprit commit, files a P0 for that commit's author, and merges freeze except the fix; a revert PR opens automatically only when attribution is confident.
  - **Freeze:** held at the merge decision. Before each merge, whoever merges reads main's lane verdicts and any open red-main P0, and while one is open merges only its fix. No ruleset, no merge-blocking check, no settings change.
  - **Confidence:** a revert is automatic only when all five hold.
    - (a) Commit C's own verdict on lane L is red.
    - (b) C's first parent has a completed green verdict on L, so C's run covered C's change alone. The verdict is read from the same record as R16: lane L's own workflow run for that commit's push, at its latest attempt; no completed run reads as not green.
    - (c) The failing jobs, rerun once on C, are red again.
    - (d) The same failing jobs pass at C's first parent. Lane L is dispatched on main (`workflow_dispatch` with ref `main`, since a dispatch ref is a branch or tag, never a SHA) with the parent's SHA and the failing jobs' test set as inputs, checks out that SHA, and runs at the same time as the rerun on C. A red caused outside the commit (runner image, network dependency, date, expired credential) therefore never reverts a good commit.
    - (e) `git revert C` applies cleanly to main's tip.
  - **Culprit:** the first red commit. When main is already red at C1, C2's run starts from the last green commit, covers C1's change too and may also be red, but C2's parent is red, so C2 is not the culprit and gets no revert. If any condition fails, no revert PR opens, the P0 names the range from the last green to the first red commit along with the failing jobs, and the freeze holds.
  - **P0:** written before any rerun starts, recording the range the failing run covered (base..head), the failing jobs, the author mention, (a) and (b), and "(c)-(e) pending, revert: no"; the handler keeps the comment's id and, after the reruns and (e), edits that same comment (or, with issues enabled, the issue body) with every condition's result and the revert verdict. A handler stopped by its backstop leaves the P0 standing with "revert: no", which fails closed. The workflow writes the P0 body itself; the culprit commit's subject, author and message appear only inside a fenced block, with `@` neutralized. The P0 goes where the repo already holds work, with no settings change: with issues enabled, an issue under an `issues: write` the workflow declares; with issues disabled, a comment on the culprit commit's merged PR under `pull-requests: write` declared only on the red-main handler job, mentioning the author in its own text: the commit's linked account, or the merged PR's author when the commit's email links to none (`.author.login` is null). In this repo `has_issues` is `false`, so the P0 is the comment.
  - **Handler:** a workflow of its own on `workflow_run` `completed` for lane L, gated on a failed run of attempt 1 triggered by a push to main, so the run it reruns has finished. Its job declares `actions: write` for the rerun, the dispatch and the workflow-run reads, `contents: read` for the checkout and the commit, and the P0 permission. When (b) is false no revert can open, so it spends no rerun and no dispatch: (c) and (d) are recorded as "not run: (b) failed", and (e) is still recorded. The rerun it starts (attempt 2), the parent dispatch (event `workflow_dispatch`) and any manual rerun complete without passing the gate, so it never loops and writes one P0 per red push run. Lane L accepts `sha` and `jobs` as `workflow_dispatch` inputs, checks out `inputs.sha` when set, and names the SHA in its `run-name`.
  - **Check:** Does the diff's handling of a red push run on main fail to name the culprit commit, or fail to write a P0 (an issue under an `issues: write` it declares, or, with issues disabled, a comment on the culprit's merged pull request under a `pull-requests: write` it declares)? Does a job that reruns failed jobs or dispatches lane L leave `actions: write` undeclared? Does it rerun a run that has not completed (a job inside lane L's own run), dispatch the lane with the parent's SHA as its ref instead of on main with the SHA as an input, or act on any attempt but the first? Does it read a lane's verdict from anything but the lane's workflow run for that commit's push? Does it write the P0 only after waiting on reruns, or spend a rerun or a dispatch when (b) is false? Does it open a revert PR without all five confidence conditions, open one with `GITHUB_TOKEN`, or merge one without the pull-request gate? Does the P0 body carry the commit's subject, author or message outside a fenced block with `@` neutralized?
  - **WRONG:** `systemfsoftware/systemfsoftware e08764fb8f:.github/workflows/mutation.yml:14-15` declares only `contents: read`, and no job names a culprit or files a P0. Main stayed red 14 days (2026-09-25 to 2026-10-09, 372 runner-hours) until #700 removed the push trigger.
  - **RIGHT:** neutral shape: the handler workflow above, valid as written (actionlint exits 0). It reads (a) and (b) from lane L's workflow runs (`gh api .../actions/workflows/<lane>.yml/runs?head_sha=<sha>&event=push`), finds C's PR with `gh api .../commits/<sha>/pulls` and writes the P0 with `gh api .../issues/<pr>/comments`, keeping its id; only when (b) holds does it rerun the failed jobs with `gh run rerun <id> --failed`, dispatch lane L with `gh workflow run <lane> --ref main -f sha=<parent>` and wait for both; it tests (e) with `git revert --no-commit` and edits the same comment with `gh api --method PATCH .../issues/comments/<id>`, recording whether all five conditions held; the patrol opens the revert PR with its user credential only then. The why cites the same-day outcome the rule asks for: in `systemfsoftware/stryker-js-effect`, #276 and #283 merged 4 s apart on 2026-10-10, #283 renamed a field #276 read, its Nix, CI and Release runs went red (`38072120188`, `38072120209`, `38072120373`), and the root fix #295 (`65ecde3cbe`) landed about 2 h later with CI green (`38080274552`).
  - **Grounds:** SafeRevert, ICST 2024 (https://hackthology.com/saferevert-when-can-breaking-changes-be-automatically-reverted.html): "A change is safe to revert if the chance it is a true culprit is >99%", and "All of these problems behave in _version non-hermetic_ ways, where failures may not be strictly linked to the version of code executed." John Micco, "Flaky Tests at Google and How We Mitigate Them", 2016-05-27 (https://testing.googleblog.com/2016/05/flaky-tests-at-google-and-how-we.html): "about 84% of the transitions we observe from pass to fail involve a flaky test". For (e), Henderson et al., ICST 2026: "a bug-introducing change can be automatically reverted without review, provided there haven't been further changes that would cause merge conflicts".
- R16. `release-promotes-the-staging-proven-build`. A release reads the commit's recorded verdict, meaning lane L's own workflow run for that commit's push at its latest attempt, fails closed when no completed run exists or it did not succeed, and promotes what they proved: a deployed product promotes the digest staging recorded, and a library repo with no staging tags the main commit whose recorded postsubmit verdicts are green. It never rebuilds from source, reruns a verdict or `needs:` a test job, and nothing scripted runs against a deployed stage. R15(b) reads the same record.
  - **Check:** Does the diff's release job rebuild from source, rerun tests, or `needs:` a test job instead of reading the commit's recorded verdicts? Does the release read verdicts from anything but lane L's workflow run for the push of the exact commit, or proceed when no completed run exists? Does a library release tag a commit without reading its postsubmit verdicts, or a deployed release promote anything but staging's recorded digest? Does anything scripted run against a deployed stage?
  - **WRONG:** `systemfsoftware/effect-endgame-starter-kit 375e468:.github/workflows/release-gate.yml:79-97`. The production deploy `needs: [ci, plan, mutation]` (`:81`) and runs `nix develop --command pnpm run deploy` (`:97`), so it rebuilds from source and waits on mutation shards whose jobs carry `timeout-minutes: 75` (`:40`). Also unnamed: a private product repo runs a scripted check against its deployed staging stage after each deploy (CI audit, 2026-10-11).
  - **RIGHT:** neutral shapes. Deployed: the release promotes the digest staging recorded and builds nothing. Library: a workflow on `workflow_run` `completed` for lane L on main, whose job runs only when the run came from a push and concluded `success` (so a red main does not turn the release red as well), then reads lane L's workflow run for `workflow_run.head_sha` (`actions/workflows/<lane>.yml/runs?head_sha=<sha>&event=push`, under `actions: read`) as the fail-closed proof, tags that commit when it succeeded, and publishes flake outputs that substitute from the cache; it never rebuilds them. Valid as written (actionlint exits 0).
  - **Grounds:** _Software Engineering at Google_ ch. 23, "Release candidate testing": "There are several reasons why it's important to run a comprehensive, automated test suite against an RC, even if it is the same suite that CB just ran against the code on post-submit". The reasons it gives are a sanity check that "nothing strange happened when the code was cut and recompiled", auditability, cherry picks and emergency pushes. Digest promotion removes them: nothing is recut or recompiled, the recorded verdicts are attached to the commit the release names, and a cherry-pick or emergency fix is a new main commit with its own verdicts.
- R17. `heavy-lanes-state-their-daily-minutes`. Every heavy lane states its runner-minutes per day at the repo's measured 7-day merge rate, with the per-run minutes, the merge count and the run ids behind the number. The merge rate is the count of first-parent commits on main in the 7-day window; each squash merge is one push and one run.
  - **Check:** Does a heavy lane the diff adds or changes lack a header comment stating runner-minutes per day, the per-run minutes, the 7-day first-parent merge count and the run ids behind them?
  - **WRONG:** `systemfsoftware/systemfsoftware e08764fb8f:.github/workflows/mutation.yml:1-15` carries no cost header. The lane's cost was first written down after 14 red days, in #700's body ("each failed run costs about 7-9 runner-hours"); by then 372 runner-hours had been spent.
  - **RIGHT:** neutral header built from measured numbers: whole-lane push runs at 324-422 job-min, 75 first-parent commits on main in the 7 days 2026-10-04T06:00Z to 2026-10-11T06:00Z (10.7/day), so about 3,500-4,500 runner-min/day; an in-diff run near 10 job-min prices the same lane at about 107. The window held 86 commits in all; the other 11 are subtree squashes and merges inside a push, which start no run.
- R18. `no-lane-grades-the-repos-own-docs`. No CI job or test has the repo's own docs, plans or layout as its subject. In a tooling repo, tests of the tool it ships are product tests.
  - **Check:** Does the diff add a CI job or test whose subject is the repo's own docs, plans or layout rather than a product's or a shipped tool's behaviour?
  - **WRONG:** this repo's deleted upstream grader. `systemfsoftware/systemfsoftware 04b03ab26b:package.json:19` ran a `guard:upstream` task that no package defined, `:21` built the grader and ran its selftest, and `.github/actions/checks-lane/action.yml:51-61` fetched refs no tracked file declared. #727 (`17bc8afeaf`) deleted it.
  - **RIGHT:** `systemfsoftware/systemfsoftware 557499d55d` (#714). The static lane plants a lock with no specifiers and requires the shipped `repo-checks` deno-locks check to exit 1. That is a test of the tool's behaviour.

**Delivery**

- R19. The pack ships as a pull request watched to green. Its body carries the full ce-code-review rulings, and the `docs/solutions/` entry is decided by ce-compound: a stated skip when R14's rule file already carries the `queue: max` lesson whole.
- R20. Before the push, a whole-word, case-sensitive grep for every PRIVATE name in `.ci-evidence/brainstorm/visibility.txt` finds nothing in the pack's contents, its file names, the commit messages or the PR body, after common-word collisions are reviewed by hand.

### Acceptance Examples

- AE1. **Covers R15.** Given stryker-js-effect on 2026-10-10, when #283's Nix verdict is red, then no revert PR opens: condition (b) fails, because #283's parent #276 has no completed Nix verdict (its run `38072116236` was cancelled), so (c) and (d) are never reached. The P0 names the range #276..#283 and the freeze holds until the fix.
- AE2. **Covers R14.** Given a lane with `group: x-${{ github.ref }}` and `cancel-in-progress: ${{ github.ref != 'refs/heads/main' }}`, when a reviewer reads the diff, then the lane fails the check because it has no `queue: max`. With `group: x-${{ github.event_name == 'push' && github.sha || github.ref }}` it passes.
- AE3. **Covers R8.** Given a job with `runs-on` and `timeout-minutes: 75`, the reviewer rejects it, because every such job sets exactly 60. A `uses:` caller job with no `timeout-minutes` passes. A step with no `timeout-minutes` passes. A step running `timeout 300 <cmd>` is rejected, and so is a planner input `max-seconds: 1800`.
- AE4. **Covers R14, R15.** Given main green at C0, red at C1 and red at C2, when C2's push run scopes from C0, then it covers C1's and C2's changes. C1 is the culprit, since its parent C0 is green. A revert PR for C1 opens only if the failing jobs rerun on C1 are red, the same jobs pass when lane L is dispatched on main with C0's SHA as input at the same time, and `git revert C1` applies cleanly to main's tip. C2 gets no revert, because its parent is red.
- AE5. **Covers R14.** Given a lane whose last green commit is not an ancestor of this commit (main was rewritten, or the record is missing), when the push run starts, then it runs the full corpus.
- AE6. **Covers R15.** Given main green at C0 and red at C1 after the runner image changed, when the failing jobs are rerun on C1 and lane L is dispatched with C0's SHA at the same time and both are red, then condition (d) fails: no revert PR opens, the P0 names the failing jobs, and the freeze holds until the fix.

### Scope Boundaries

- Deferred for later: implementing the rules in the shared reusable workflows (step-summary writers, concurrency, the P0 filer, main-only artifact writes); lane L's `sha` and `jobs` dispatch inputs and the red-main handler workflow for R15(c)-(e); the patrol's revert-PR opener; updating the conflicting doctrine in Appendix B.
- Outside this pack: any gate, lint rule or CI check (no gritlint or oxlint rule); batching and bisection; a scheduled full corpus; settings changes; other repos' config.

### Dependencies / Assumptions

- The step-summary numbers R8, R9 and R13 rely on are written by the shared workflows. Until the shared-tooling unit lands, a reviewer reads them from the run's job timings.
- R12's private-fleet case names the substituter's contract (in-region, signed push from main, PRs read-only), not an implementation, and depends on no unmerged runner change.
- This repo's Actions settings, verified by the sub-conductor on 2026-10-11: `{"default_workflow_permissions":"read","can_approve_pull_request_reviews":true}`. The org-level read is refused, so other repos' values are unknown, and R15's handler declares `actions: write` and its P0 permission (`issues: write`, or `pull-requests: write` where issues are disabled) in the workflow's own diff.
- The conductor's patrol holds a user credential (`.ci-evidence/brainstorm/revert-credentials.md` section 6), so a PR it opens runs ordinary `pull_request` workflows. GitHub, "Triggering a workflow" (https://docs.github.com/en/actions/how-tos/write-workflows/choose-when-workflows-run/trigger-a-workflow): "Using one of these alternatives also lets `pull_request` workflows run automatically (without the approval prompt described above) when the pull request is created or updated by automation."

### Outstanding Questions

**For the root (not launch-blocking unless marked)**

- Q5. Closed at the plan gate (root, 2026-10-11): the fallback applies. No R21 file ships, because sandbox UI evidence is not a CI wall-clock rule and a rule without a real incident does not count. The README names Compound Engineering's ce-test-browser stage as the owner of the coding agent's pre-PR UI evidence, alongside the other R4 owners (KD9).
- Q7. Closed at the plan gate (root, 2026-10-11): these eleven ids are approved and frozen under KD2: `one-stuck-job-backstop`, `setup-under-a-minute`, `light-checks-run-the-pinned-tool`, `no-dev-shell-on-verdict-lanes`, `flake-outputs-build-once-on-main`, `pr-gate-runs-only-what-the-diff-affects`, `heavy-suites-judge-every-main-commit`, `red-main-reverts-its-culprit-same-day`, `release-promotes-the-staging-proven-build`, `heavy-lanes-state-their-daily-minutes`, `no-lane-grades-the-repos-own-docs`. The root also confirmed R12's refinement as written: a PR job may build an artifact without saving it only when its diff changes the artifact's inputs, or when the restore of main's key misses.

---

## Planning Contract

### Key Technical Decisions

- KTD1. **Each rule file renders its R-entry; it adds no rule text.** The `## Rule` section holds the rule sentence and the why. The WRONG/RIGHT block is a code block (`yaml` for workflow excerpts, `text` for neutral shapes) whose comment lines carry the citation and measurement, as `compound-packs/mutation-discipline/kill-survivors-with-contract-properties.md:22-40` does. Grounds follow as prose with URL and verbatim quote. The file closes with ``Gate: `review`.`` and the check question. Governs R1, R6, R8-R18.
- KTD2. **Citations are verified at their SHA, never copied from this plan.** Every `<repo> <sha>:<path>:<line>` is read at that SHA (`git show` in this repo; for another public repo, the OP8 local clone with that SHA fetched) before it goes into a rule file. A line that moved is corrected in the rule file and in this plan. Governs R6, R7.
- KTD3. **No changeset.** `compound-packs/` has no `package.json`, and `git grep -n compound-packs origin/main -- flake.nix nix/ package.json turbo.json .github/` exits 1, so no publishable package's turbo build hash changes (REPO-R2). Governs R19.
- KTD4. **The `docs/solutions/` decision goes to ce-compound.** If R14's file carries the `queue: max` lesson whole (the default-pending replacement, the stryker-js-effect runs and both fixes), the PR body states the skip. Governs R19.
- KTD5. **The docs-set path glob is a CONST-T12 finding, not R13's exemplar.** `classify-diff` decides that build, test and nix are skipped from paths (`docs/**`, root `*.md`), which is "from its name or location". It goes to Appendix A; R13's RIGHT cites only the graph-based skip. Governs R13.
- KTD6. **No pack among the six applies to this change.** Their `applies_when` lines name code (stores, cells, schemas, package entries, stories, mutants), and this change is markdown plus one config line. `mutation-discipline` and `storybook-testing` are format models (R1), and `storybook-testing/real-browser-axe-as-error.md` and `stories-are-the-ui-integration-tests.md` are owners R4 and R13 cite.

### Output Structure

```text
compound-packs/ci-wall-clock/
  README.md
  one-stuck-job-backstop.md
  setup-under-a-minute.md
  light-checks-run-the-pinned-tool.md
  no-dev-shell-on-verdict-lanes.md
  flake-outputs-build-once-on-main.md
  pr-gate-runs-only-what-the-diff-affects.md
  heavy-suites-judge-every-main-commit.md
  red-main-reverts-its-culprit-same-day.md
  release-promotes-the-staging-proven-build.md
  heavy-lanes-state-their-daily-minutes.md
  no-lane-grades-the-repos-own-docs.md
.compound-engineering/config.yaml   (one added entry)
```

### Sequencing

U1-U6 are independent pack files and may be written in any order. U7 needs U1. U8 needs every other unit.

---

## Implementation Units

### U1. Pack README

- **Goal:** the README a reviewer reads first: what the pack judges, the owners it cites, and the rule list.
- **Requirements:** R1, R2, R4.
- **Dependencies:** none.
- **Files:** `compound-packs/ci-wall-clock/README.md`.
- **Approach:**
  1. Copy the shape of `compound-packs/mutation-discipline/README.md`: H1 `# CI Wall-Clock Compound Pack`, one framing paragraph, the "What other owners already cover is not repeated here" paragraph with R4's owners (Compound Engineering's ce-test-browser stage among them, KD9), a "Rules in this pack govern:" list naming each slug in R2's order with a one-line gist, and the closing "No tool enforces these judgments; each rule's gate is review." line.
  2. State the id scheme once (KD2).
- **Patterns to follow:** `compound-packs/mutation-discipline/README.md`, `compound-packs/storybook-testing/README.md`.
- **Test scenarios:**
  - The README's slug list equals the file names in the directory, in R2's order.
  - Each owner path in the README resolves at origin/main (`git show origin/main:<path>`), and `.github/AGENTS.md:36` and `docs/solutions/tooling-decisions/pnpm-owns-the-changeset-ledger.md:109` still carry the cited sentences.
- **Verification:** the README restates no owner's rule; each owner appears as a citation only.

### U2. Timeout, setup and dev-shell rules

- **Goal:** the four rules about what a job spends before and around its verdict.
- **Requirements:** R6, R8, R9, R10, R11; AE3.
- **Dependencies:** none.
- **Files:** `compound-packs/ci-wall-clock/one-stuck-job-backstop.md`, `setup-under-a-minute.md`, `light-checks-run-the-pinned-tool.md`, `no-dev-shell-on-verdict-lanes.md`.
- **Approach:** render each R-entry per KTD1, verifying citations per KTD2. R8's file carries the reusable-workflow keyword quote and the `uses:` exemption. R9's RIGHT says it shows only the setup shape.
- **Test scenarios:**
  - R8 Check against WRONG `systemfsoftware/systemfsoftware e08764fb8f:.github/workflows/mutation.yml:91` (`timeout-minutes: 30`): fails.
  - R8 Check against RIGHT `e9543bae65:.github/workflows/reusable-checks.yml:381` (`timeout-minutes: 60`): passes.
  - R8 Check against `02bf9653b1:.github/workflows/ci.yml:55-73` (the `checks` caller job, `uses:` with no `timeout-minutes`): passes.
  - R8 Check against `02bf9653b1:.github/actions/checks-lane/action.yml:125` (`timeout 300 corepack pnpm ...`): fails.
  - R9 Check against WRONG `systemfsoftware/pnpm-release-management 8cd6e83009:.github/workflows/changeset-check.yml:66-71` (`nix build` before the check): fails.
  - R9 Check against RIGHT `02bf9653b1:.github/actions/install-deps/action.yml:17,27`: passes.
  - R10 Check against WRONG `02bf9653b1:.github/workflows/reusable-commitlint.yml:27-31,61,82-85` (producer, `needs:`, install): fails.
  - R10 Check against RIGHT `02bf9653b1:.github/workflows/changeset-check.yml:26-32` (pinned Deno tool, no install): passes.
  - R11 Check against WRONG `systemfsoftware/effect-endgame-starter-kit 375e468:.github/workflows/ci.yml:49,59` (dev shell around the gate): fails.
  - R11 Check against RIGHT `02bf9653b1:.github/actions/install-deps/action.yml:17,27` (no Nix): passes.
- **Verification:** each run id cited in these files is re-read through the Actions API for its repo, and its step timings match the file.

### U3. Flake-output caching rule

- **Goal:** R12 with its public and private-fleet cases.
- **Requirements:** R6, R12; KD8.
- **Dependencies:** none.
- **Files:** `compound-packs/ci-wall-clock/flake-outputs-build-once-on-main.md`.
- **Approach:** render R12 per KTD1, with the public and private-fleet cases as the rule's two parts, the three-question check, and the dependency-caching quotes as Grounds. The `applies_when` names caching or building a flake output in CI, a workflow `permissions` or `cache-mode` change, and runner substituter configuration.
- **Test scenarios:**
  - Check against WRONG `02bf9653b1:.github/actions/sfs-deps/action.yml:94-95` (save on any event): fails question 3.
  - Check against WRONG `02bf9653b1:.github/workflows/reusable-checks.yml:379-390` with `reusable-commitlint.yml:27-31` (one producer per reusable call, each saving through `sfs-deps/action.yml:94-95`): fails question 3 and the rule's built-once-on-main sentence, since each call builds the same key.
  - Check against the public RIGHT shape (main-only save keyed on the drvPath; PR jobs with `cache-mode: read` and `actions/cache/restore`): passes all three questions.
  - Check against a public-repo diff adding `permissions: id-token: write` for a cache: fails question 2.
  - Check against `02bf9653b1:.github/actions/checks-lane/action.yml:171-176` (gritlint closure saved on a miss from PR runs too): fails question 3.
- **Verification:** `git grep -n -E 'id-token|aws-actions|role-to-assume|google-github-actions/auth|azure/login' origin/main -- .github/` exits 1, confirming this repo already meets question 2.

### U4. PR gate rule

- **Goal:** R13 decided by the build graph.
- **Requirements:** R6, R7, R13; KD6; KTD5.
- **Dependencies:** none.
- **Files:** `compound-packs/ci-wall-clock/pr-gate-runs-only-what-the-diff-affects.md`.
- **Approach:**
  1. Render R13 per KTD1. Its RIGHT cites only the graph-based skip (KTD5).
- **Test scenarios:**
  - R13 Check against WRONG `02bf9653b1:.github/workflows/ci.yml:86-103` (smoke on every non-docs PR, `:89`): fails.
  - R13 Check against RIGHT `02bf9653b1:.github/workflows/reusable-checks.yml:126,272-273` and `reusable-nix.yml:105,129`: passes.
  - R13 Check against `02bf9653b1:.github/workflows/storybook-gherkin-browser.yml:6-13` (affected-ness from a path filter): fails.
- **Verification:** R13's file contains no docs-set glob as an exemplar.

### U5. Postsubmit and red-main rules

- **Goal:** R14 and R15, the per-commit verdict and what happens when it is red.
- **Requirements:** R6, R14, R15; KD3, KD4, KD7, KD10; AE1, AE2, AE4, AE5, AE6.
- **Dependencies:** none.
- **Files:** `compound-packs/ci-wall-clock/heavy-suites-judge-every-main-commit.md`, `red-main-reverts-its-culprit-same-day.md`.
- **Approach:** render each R-entry per KTD1. R14's file carries the TAP departure and its arithmetic. R15's file lists the five conditions, the culprit rule, the freeze and the credential split (KD3), and its why cites the stryker-js-effect same-day fix as the outcome the rule asks for.
- **Test scenarios:**
  - R14 Check against WRONG `systemfsoftware/stryker-js-effect 815754693e:.github/workflows/mutation.yml:27-28` (no `queue`, main-side cancel false): fails.
  - R14 Check against WRONG `systemfsoftware/systemfsoftware e08764fb8f:.github/workflows/mutation.yml:6-7,10-12` (`pull_request` trigger, cancel true on main): fails.
  - R14 Check against RIGHT `systemfsoftware/gritlint 5c9c2ab:.github/workflows/mutants.yml:19-20` (group by SHA on push, cancel false): passes.
  - R14 Check against AE2's two concurrency blocks: the first fails and the second passes.
  - R15 Check against WRONG `e08764fb8f:.github/workflows/mutation.yml:14-15` (only `contents: read`, no culprit, no P0): fails.
  - R15 Check against the neutral RIGHT (a `workflow_run` handler gated on attempt 1 of a failed push run, `actions: write` and `pull-requests: write` declared, verdicts read from lane L's push workflow runs, a P0 comment on C's merged PR written before any rerun and edited with the results, no rerun or dispatch when (b) is false, lane dispatched on main with the parent SHA as input, no `GITHUB_TOKEN` revert): passes.
  - Walking AE1, AE4 and AE6 through R15's five conditions gives the stated outcome for each.
- **Verification:** the TAP passage, the SafeRevert passages and the clean-revert passage are re-read at their URLs and match the file verbatim.

### U6. Release, cost and docs-subject rules

- **Goal:** R16, R17 and R18.
- **Requirements:** R6, R7, R16, R17, R18.
- **Dependencies:** none.
- **Files:** `compound-packs/ci-wall-clock/release-promotes-the-staging-proven-build.md`, `heavy-lanes-state-their-daily-minutes.md`, `no-lane-grades-the-repos-own-docs.md`.
- **Approach:** render each R-entry per KTD1. R16's file carries both repo shapes, the SWE-book passage and the reasons digest promotion removes. Its private incident appears as an unnamed pattern with its date (R7). R17's file states the first-parent merge-rate definition.
- **Test scenarios:**
  - R16 Check against WRONG `systemfsoftware/effect-endgame-starter-kit 375e468:.github/workflows/release-gate.yml:79-97` (`needs: [ci, plan, mutation]`, `nix develop` deploy): fails.
  - R16 Check against the neutral deployed and library RIGHT shapes: both pass.
  - R16 Check against `systemfsoftware/pnpm-release-management 8cd6e83009:.github/workflows/release.yml:55-57,124` (the release job builds `.#workspace-tarballs`): fails.
  - R17 Check against WRONG `systemfsoftware/systemfsoftware e08764fb8f:.github/workflows/mutation.yml:1-15` (no cost header): fails.
  - R17 Check against the neutral header: passes.
  - R17's arithmetic recomputes: `git rev-list --first-parent --count --since=2026-10-04T06:00Z --until=2026-10-11T06:00Z origin/main` prints 75; 324 × 10.7 and 422 × 10.7 give about 3,500 and 4,500.
  - R18 Check against WRONG `systemfsoftware/systemfsoftware 04b03ab26b:package.json:19,21` with `.github/actions/checks-lane/action.yml:51-61`: fails.
  - R18 Check against RIGHT `557499d55d` (the planted-lock test of the shipped `repo-checks`): passes.
- **Verification:** R16's file names no private repo, path or run; R17's file uses 75 and 10.7/day.

### U7. Enrol and load the pack

- **Goal:** the pack is declared and every CE skill that reads packs resolves it.
- **Requirements:** R5.
- **Dependencies:** U1.
- **Files:** `.compound-engineering/config.yaml`.
- **Approach:** append `- source: compound-packs/ci-wall-clock` under `packs:` after the six existing entries, in their format.
- **Execution note:** packaging/config; prove it by running the loader, not by inspection.
- **Test scenarios:**
  - The CE pack resolver (`scripts/packs-resolve.py` in the ce-brainstorm, ce-plan, ce-code-review and ce-doc-review skill directories), run from the repo root, returns a root with id `ci-wall-clock` and the pack directory, with empty `errors` and `warnings`.
  - The same resolver still returns the six existing roots.
- **Verification:** the resolver's JSON is shown in the PR body.

### U8. Deliver

- **Goal:** one green PR whose body carries the review rulings.
- **Requirements:** R19, R20; KTD3, KTD4.
- **Dependencies:** U1-U7.
- **Files:** no new tracked file beyond U1-U7 and this plan.
- **Approach:**
  1. Run the privacy grep (Verification Contract).
  2. Run `pnpm check:local` after the last edit (REPO-D1).
  3. Commit with `docs(...)` subjects (REPO-C1, REPO-C2; config-only changes cannot be `feat` or `fix`).
  4. Ship as a `gh stack` layer on `main` after both OP13b pre-push checks exit 0.
  5. Run the full ce-code-review, put its rulings in the PR body, and resolve every P0 and P1 before marking ready (REV1).
  6. Hand the `docs/solutions/` decision to ce-compound (KTD4) and record its outcome in the PR body.
  7. Watch CI to green.
- **Test scenarios:**
  - The PR adds exactly one file under `docs/plans/` (REPO-D2).
  - No `.changeset/` file is added, and the changeset-check workflow passes (KTD3).
  - The privacy grep over the PR body, run after the body is final, finds nothing.
- **Verification:** CI green on the PR head; head SHA reported for the operator.

---

## Verification Contract

- **Check against citations:** for every rule, its check question is answered against its WRONG lines (must fail) and its RIGHT lines (must pass), each read at the cited SHA with `git show <sha>:<path>` (or the OP8 local clone for another public repo). The scenario lists live on U2-U6.
- **Format parity:** the set of frontmatter keys in each new rule file equals `{title, applies_when, tags}`, the keys of every `compound-packs/mutation-discipline/*.md` rule file. Each file's last non-empty line starts with ``Gate: `review`.``, as in `compound-packs/mutation-discipline/kill-survivors-with-contract-properties.md:44`. Each file has exactly one `## Rule` heading.
- **Loader:** U7's resolver run.
- **Privacy:** grep each PRIVATE name from `.ci-evidence/brainstorm/visibility.txt` whole-word and case-sensitive (`git grep -n -w -F -e <name>`) over the pack and this plan, over `git ls-files compound-packs/ci-wall-clock` for file names, over `git log origin/main..HEAD --format=%B`, and over the final PR body. A substring grep is wrong, because it matches a name inside an ordinary word. Hits on common English words are reviewed by hand and pass when they are not the repo.
- **Repo gate:** `pnpm check:local` exits 0 after the last edit (REPO-D1).
- **CI:** watched through the built-in run watcher (`xd://github run_watch`), never `gh pr checks` (OP13).

---

## Definition of Done

- The eleven rule files and the README exist under `compound-packs/ci-wall-clock/`, and each rule's check fails on its WRONG lines and passes on its RIGHT lines at the cited SHAs.
- Every neutral RIGHT workflow in the pack that is written as a whole workflow (R15's handler, R16's library release) is valid as written: actionlint exits 0 on it.
- R15 and R16 in this plan say what their rule files say, including the revisions recorded below.
- `.compound-engineering/config.yaml` enrols the pack, and the resolver loads it with no errors or warnings.
- The privacy grep is clean, `pnpm check:local` exits 0, and the PR is green with the ce-code-review rulings and the `docs/solutions/` outcome in its body.
- No file under `.github/`, no other repo and no setting changed; no draft or abandoned rule text is left in the diff.

## Revisions after the plan gate (2026-10-11)

The plan stays one file in this PR (REPO-D2) and has never been on main, so it is revised in place; each change and its source:

- **R15 P0 location** (root ruling, 2026-10-11): an issue when the repo has issues enabled, otherwise a comment on the culprit commit's merged PR under `pull-requests: write`. Before, the plan required an issue under `issues: write`, which this repo cannot hold without a settings change (`has_issues` is `false`).
- **R16 library release example** (root ruling, 2026-10-11): the release starts when lane L's run on main completes (`workflow_run` `completed`) and reads check runs on that run's head SHA. Work gate on `c313b254ae`: its job also requires `workflow_run.conclusion == 'success'`, so a red main does not add a second red signal, and the verdict read stays the fail-closed proof.
- **R15 handler and condition (d)** (work gate on `c313b254ae`): a `workflow_dispatch` ref is "a branch or tag name", so lane L is dispatched on main with the parent's SHA as an input instead of at the parent's commit. A run is rerun after it completes, so the handler is its own `workflow_run` workflow gated on attempt 1, not a job inside lane L's run, and it declares `actions: write` for the rerun and the dispatch.
- **Verdict record, R15(b) and R16** (work gate on `74683ec452`): a check run is named after a job ("mutation / mutation · answer" on main's `02bf9653b1`), and `check_name` "Returns check runs with the specified `name`.", so `check_name=mutation` returned no check run and both RIGHT examples failed closed on every commit; a test that every check run succeeded would also fail an in-diff run that skips jobs. Both now read lane L's workflow run for the commit's push ("Only returns workflow runs that are associated with the specified `head_sha`.", "List workflow runs for a workflow"), latest attempt, failing closed when no completed run exists; the release declares `actions: read` ("The fine-grained token must have the following permission set: "Actions" repository permissions (read)") instead of `checks: read`, and the handler drops `checks: read`.
- **R15 P0 written first** (work gate on `74683ec452`): the handler writes the P0 before any rerun, with (c)-(e) pending and "revert: no", keeps the comment's id, and edits that comment after the reruns and (e) through "Update an issue comment" (`PATCH /repos/{owner}/{repo}/issues/comments/{comment_id}`, the same "Issues" or "Pull requests" write permission sets). A handler stopped by its 60-minute backstop leaves "revert: no", which fails closed. The mention falls back to the merged PR's author when the commit's `.author.login` is null, and the handler checks out with `actions/checkout@v7`.
- **R15 with (b) false** (work gate on `74683ec452`): no revert can open, so the handler spends no rerun or dispatch, records (c) and (d) as "not run: (b) failed", and still records (e). The stryker-js-effect example is this case on the Nix lane.

---

## Appendix

### A. Jobs in this repo that the rules condemn as written (input to the shared-tooling unit; not edited here)

| Rule | origin/main location                                                                                                                                                                                                                                                                                                                                                                                                           | Finding                                                                               |
| ---- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------- |
| R8   | `changeset-check.yml:21`; `conflict-check.yml:22`; `ci.yml:28,77,91`; `consumer-fixture.yml:38,89`; `reusable-commitlint.yml:64`; `reusable-checks.yml:164,221,469,582,665` (from input defaults of 30, 5 and 2 at `:74,79,94`), `:357,542,610,627,643` (steps); `reusable-mutation.yml:58,74,167,255,301` (167 and 301 from defaults of 75 and 25 at `:29,34`); `reusable-nix.yml:52,232`; `storybook-gherkin-browser.yml:34` | Job timeouts of 2-46 min, step timeouts of 3, and a 75-min default above the backstop |
| R8   | `ci.yml:71,73` (`"timeout-minutes": 45`, `30` in the lanes input, applied at `reusable-checks.yml:408`)                                                                                                                                                                                                                                                                                                                        | Lane timeouts below 60 handed to the callee                                           |
| R8   | `.github/actions/checks-lane/action.yml:125` (`timeout 300` around a negative probe)                                                                                                                                                                                                                                                                                                                                           | A wall-clock kill below 60 handed to a tool; the step still fails when it fires       |
| R8   | `reusable-checks.yml:65-69,355` (`max-seconds` defaults to 1800 and is handed to the planner)                                                                                                                                                                                                                                                                                                                                  | A lane-level tool cap of 30 min, below the backstop                                   |
| R9   | `changeset-check.yml:12-17` (callee `nix build`, 119 s, run `38105407053`)                                                                                                                                                                                                                                                                                                                                                     | Source build before the verdict                                                       |
| R9   | `.github/actions/checks-lane/action.yml:284-289` (test lanes run `turbo run build` before `Test`)                                                                                                                                                                                                                                                                                                                              | Workspace build before the verdict                                                    |
| R10  | `reusable-commitlint.yml:27-31,61,82-85`; `changeset-check.yml:12-17` (callee `pnpm install`)                                                                                                                                                                                                                                                                                                                                  | Producer job and install before a light check                                         |
| R11  | none (no job or action runs `nix develop`)                                                                                                                                                                                                                                                                                                                                                                                     | -                                                                                     |
| R12  | `.github/actions/sfs-deps/action.yml:94-95` and `.github/actions/checks-lane/action.yml:171-176` (cache saves with no main-only condition, so PR runs write); `reusable-checks.yml:379-390` with `reusable-commitlint.yml:27-31` (one `.#sfs-deps` producer per reusable call); `.github/actions/checks-lane/action.yml:59` (`.#repo-checks` built in every static run, with no cache around it)                               | PR runs write artifacts; one key built more than once; an artifact rebuilt every run  |
| R13  | `ci.yml:86-103` (smoke on every non-docs PR); `storybook-gherkin-browser.yml:6-13` (path filter); `.github/actions/classify-diff/action.yml:3,13` (docs set decided by path, CONST-T12)                                                                                                                                                                                                                                        | Heavy suite on PRs; affected-ness decided by path                                     |
| R14  | `mutation.yml:3-8` (dispatch only; group per ref, cancel true); `ci.yml:10-12`; `nix.yml:11-13`; `consumer-fixture.yml:18-20`                                                                                                                                                                                                                                                                                                  | No per-push heavy verdict; main pushes cancel each other                              |
| R15  | no postsubmit lane names a culprit, files a P0 or records revert conditions                                                                                                                                                                                                                                                                                                                                                    | Mechanism absent                                                                      |
| R16  | `release.yml:18` calls `systemfsoftware/pnpm-release-management 8cd6e83009:.github/workflows/release.yml`, whose release job builds `.#workspace-tarballs` (`:55-57,124`) and tags without reading the commit's postsubmit verdicts                                                                                                                                                                                            | Release rebuilds its artifact and reads no recorded verdicts                          |
| R17  | `mutation.yml`; `consumer-fixture.yml:78-84`; `ci.yml:86-103`                                                                                                                                                                                                                                                                                                                                                                  | No daily runner-minutes stated                                                        |
| R18  | `ci.yml:72` (`single-plan` docs-run); `package.json:20` (`gate:repo` runs `repo-checks -- ... single-plan`)                                                                                                                                                                                                                                                                                                                    | Plans as subject; REPO-D2 stays a review-time law, see Appendix B                     |

### B. Existing doctrine that contradicts the rules (doctrine, never a gate input)

- `.github/AGENTS.md:21`: "`mutation.yml` triggers on `workflow_dispatch` only" contradicts R14. It was set by #700 as a stopgap that promises the push trigger back.
- `.github/AGENTS.md:61-66,86-87`: timeout input defaults of 30, 5, 2, 75 and 25, and a `max-seconds` default of 1800 tied to "the test job's timeout-minutes in seconds", contradict R8, which counts a lane-level tool cap such as `max-seconds` as a kill cap (root ruling 2026-10-11).
- `docs/plans/2026-10-10-1927-ci-sfs-deps-input-plan.md:20,70,168`: a 10-minute cold-producer stop condition and a "10-minute PR job ceiling" contradict R8. Plans are records, and these lines have been stale since `e9543bae65`.
- `docs/solutions/architecture-patterns/mutation-budgets-split-rule-packages-into-private-cells.md:10,23` frames a wall-clock budget as "one timeout". Its remedy is at the cause, so it is compatible with R8 apart from that wording.
- `AGENTS.md` REPO-D2's one-plan-per-PR convention stays a review-time law; the single-plan CI lane (`ci.yml:72`, `package.json:20` `gate:repo`) is what R18 condemns, and the shared-tooling unit removes it.
- `AGENTS.md` REPO-S3 (the subtrees check) guards the vendored `repos/` trees against edits. It is not a docs or layout grader, so it is out of R18's scope (root ruling at the plan gate, 2026-10-11).
- `#714` (`557499d55d`) added a cheap PR check after a push-only failure. R14's "never in a pull request" bars copying a heavy suite into a PR, not a cause-class check.

### C. Prior art (primary sources fetched; quotes verbatim)

- Henderson et al., "Taming the Variants", ICST 2026: quoted at R14 (best-effort presubmit; the per-change departure) and R15 (clean revert).
- SafeRevert, ICST 2024: quoted at R15 (>99% bar; version non-hermetic failures).
- "Efficacy Presubmit" and Micco 2016: quoted at R13, R14 and R15.
- _Software Engineering at Google_ ch. 23: quoted at R13 and R16.
- GitHub docs: reusable-workflow keywords (R8), dependency-cache scope (R12), concurrency (R14), triggering a workflow (Dependencies), and for R15's handler the REST references "Create a workflow dispatch event" and "Re-run failed jobs from a workflow run", "Re-running workflows and jobs", the `GITHUB_TOKEN` trigger exceptions and the `workflow_run` event; for the verdict record and the P0 update, "List check runs for a Git reference", "List workflow runs for a workflow" and "Update an issue comment".
- Dropped as unverified at the primary source: the "95%+" presubmit pass figure, which appears only in a secondary summary.

### D. Root ruling evidence on heavy lanes (verified by the root and sub-conductor, 2026-10-11)

This repo's pre-#700 mutation push runs `37962737026`, `37952058012`, `37946043552` and `37925930619` cost 422, 337, 370 and 324 job-min, with 23 jobs each and a longest job of 31 min. Main had 75 first-parent commits in the 7 days 2026-10-04T06:00Z to 2026-10-11T06:00Z (10.7/day; 86 commits in all, the other 11 being subtree squashes and merges that start no run). A whole-lane run on every push would cost about 3,500-4,500 runner-min/day; the root rejected it in favour of R14's last-green scope. Full non-incremental runs of the same lane cost 1103-1207 runner-min (`38109196324`, 49 min wall; `38095184480`, 72.7 min wall). For comparison, all CI runs in this repo cost about 788 runner-min/day and Nix about 396 (`.ci-evidence/brainstorm/claim-verdicts.md`).

### E. Document review notes (ce-doc-review, report-only, 2026-10-11)

Reviewers: coherence, feasibility, scope-guardian, adversarial and security-lens. The cross-model pass did not run, because no peer route was resolved. The sub-conductor ruled on every finding, and the root approves the plan; applied findings are folded into R8, R9, R12, R14, R15, R16, Scope Boundaries and Q5 above.

Rejected, with the reason:

- R17 needs a re-measurement bound: R17's check already fires on any diff that adds or changes a heavy lane, and the header is restated then.
- Nothing prompts the merger to honour the R15 freeze: the root ruled that the freeze is held at the merge decision, with no ruleset, no blocking check and no settings change.
- `cache-mode` exists on GitHub.com only: the org is on GitHub.com, and R12's RIGHT example also shows `actions/cache/restore`, which works without `cache-mode`.
- R8 should exempt sub-60 budgets that bound one unit of work: contradicts the root ruling that a lane-level tool cap such as `max-seconds` is a kill cap.
- Drop R8's step-summary clause because no repo writes it yet: any single diff can write the step summary; only the shared writers are deferred.
- Fold R18 into the README and delete its file: the root accepted R18, with Q1 recorded in Appendix B.
- A review-only pack cannot prevent the harm it cites: the brief rules out any gate; enforcement belongs to the shared-tooling unit.
- Cite the in-diff run's ids so R14's arithmetic can be redone: the root ruled the worked example neutral, with no repo and no run ids.
- U7's resolver path does not exist: `scripts/packs-resolve.py` exists in every CE skill directory U7 names.
