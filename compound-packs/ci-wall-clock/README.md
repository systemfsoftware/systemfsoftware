# CI Wall-Clock Compound Pack

Judgment for CI-facing changes. A pull request gets a fast verdict on what it affects, every push to main gets its own heavy verdict scoped from the lane's last green commit, a red main is reverted or fixed the same day, and a runner image reaches the fleet only after a canary has run real jobs. Time budgets are measured and reported in each run's step summary, never enforced; the one wall-clock kill is a 60-minute backstop for a stuck job.

The pack applies when a change:

- adds or changes a job, trigger, `matrix`, `concurrency` group, `timeout-minutes` or `paths` filter in `.github/workflows/**`;
- adds or changes a composite action under `.github/actions/**`;
- changes a CI-facing flake output: a check, a package or anything else a workflow builds;
- changes self-hosted runner configuration: substituter, job hooks, labels;
- changes a machine-image build, an AMI or launch template, or the pipeline that promotes an image to the fleet or rolls it out;
- changes a release or deploy job.

Each rule's `applies_when` names the situations it governs, and review matches them to the change by meaning. A path list is never the only test of applicability. The tags `ci`, `workflows`, `actions`, `machine-image`, `deploy` and `runners` let resolution by tag find the pack. Packs are checked only on ce-code-review's full path, and its depth gate can send a workflow change to the focused path, which loads no packs, so the review of a CI-facing diff is invoked as `ce-code-review mode:agent base:origin/main depth:full`. Its PR body carries that review's receipt, which lists every declared pack as loaded; a receipt that says no pack loaded fails (`pr-gate-runs-only-what-the-diff-affects`).

Each rule's id is `ci-wall-clock/<file slug>`. A slug is never renamed; a retired rule is deleted outright and its id is never reused.

What other owners already cover is not repeated here: fix at the cause (`CONSTITUTION.md` CONST-S1); tests of a shipped tool test the published surface (`CONSTITUTION.md` CONST-T8); what applies to code is decided by what it is, never by its path (`CONSTITUTION.md` CONST-T12; `.github/AGENTS.md:20`); mutation never on a pull request and never local (`.github/AGENTS.md:21`, root `AGENTS.md` REPO-D3); lanes never share a cache key (`.github/AGENTS.md:17`; `docs/solutions/integration-issues/parallel-lanes-race-on-one-immutable-cache-key.md:45`); how axe runs inside a story (`compound-packs/storybook-testing/real-browser-axe-as-error.md`); release runs never cancel each other (`docs/solutions/tooling-decisions/pnpm-owns-the-changeset-ledger.md:109`); the coding agent's pre-PR UI evidence, gathered by using the built product the way its user does (Compound Engineering's ce-test-browser stage). `.github/AGENTS.md:21` is cited for its pull-request half only: its `mutation.yml` "on `workflow_dispatch` only" is the stopgap #700 introduced, which `heavy-suites-judge-every-main-commit` replaces with a run on every push to main. `.github/AGENTS.md`'s input tables for the reusable workflows document their inputs as they stand; read at `02bf9653b1`, they hold timeouts of 30, 5, 2, 75 and 25 minutes and planner `max-seconds` of 1800 and 4500. Whatever those tables hold, a timeout other than 60 or a wall-clock cap is a value `one-stuck-job-backstop` refuses, not a contract a diff may follow.

Each rule file holds the rule; the list below names each one's subject, not its text.

Rules in this pack govern:

- One 60-minute stuck-job backstop per job, and wall time in the step summary (`one-stuck-job-backstop`).
- A pull-request job's setup before its first verdict step (`setup-under-a-minute`).
- Commit-message, changeset and PR-title checks (`light-checks-run-the-pinned-tool`).
- Splitting a workflow's pull-request gates into jobs or matrix legs (`gates-share-one-job`).
- Nix dev shells on lint, typecheck and test jobs (`no-dev-shell-on-verdict-lanes`).
- Where a flake artifact is built, keyed, stored and restored (`flake-outputs-build-once-on-main`).
- What a pull request's gate runs, against which base, and in what time (`pr-gate-runs-only-what-the-diff-affects`).
- Heavy suites, full VM tests and machine-image builds on pushes to main (`heavy-suites-judge-every-main-commit`).
- A red postsubmit verdict: its P0, its culprit, the merge freeze and the revert (`red-main-reverts-its-culprit-same-day`).
- What a release reads and promotes, and how a runner image reaches the fleet (`release-promotes-the-staging-proven-build`).
- The stated daily cost of a heavy lane (`heavy-lanes-state-their-daily-minutes`).
- CI jobs whose subject is the repo's own docs, plans or layout (`no-lane-grades-the-repos-own-docs`).

No tool enforces these judgments; each rule's gate is review.
