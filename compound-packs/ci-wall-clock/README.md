# CI Wall-Clock Compound Pack

Judgment for CI-facing changes. A pull request gets a fast verdict on what it affects, every push to main gets its own heavy verdict scoped from the lane's last green commit, a red main is reverted or fixed the same day, and a runner image reaches the fleet only after a canary has run real jobs. Time budgets are measured and reported in each run's step summary, never enforced; the one wall-clock kill is a 60-minute backstop for a stuck job.

The pack applies when a change:

- adds or changes a job, trigger, `matrix`, `concurrency` group, `timeout-minutes` or `paths` filter in `.github/workflows/**`;
- adds or changes a composite action under `.github/actions/**`;
- changes a CI-facing flake output: a check, a package or anything else a workflow builds;
- changes self-hosted runner configuration: substituter, job hooks, labels;
- changes a machine-image build, an AMI or launch template, or the pipeline that promotes an image to the fleet or rolls it out;
- changes a release or deploy job.

Each rule's `applies_when` names the situations it governs, and review matches them to the change by meaning. A path list is never the only test of applicability. The tags `ci`, `workflows`, `actions`, `machine-image`, `deploy` and `runners` let resolution by tag find the pack. Packs are checked only on ce-code-review's full path. A CI-facing diff's PR body therefore carries that review's receipt, which lists every declared pack as loaded; a receipt that says no pack loaded fails (`pr-gate-runs-only-what-the-diff-affects`).

Each rule's id is `ci-wall-clock/<file slug>`. A slug is never renamed; a retired rule is deleted outright and its id is never reused.

What other owners already cover is not repeated here: fix at the cause (`CONSTITUTION.md` CONST-S1); tests of a shipped tool test the published surface (`CONSTITUTION.md` CONST-T8); what applies to code is decided by what it is, never by its path (`CONSTITUTION.md` CONST-T12; `.github/AGENTS.md:20`); mutation never on a pull request and never local (`.github/AGENTS.md:21`, root `AGENTS.md` REPO-D3); how axe runs inside a story (`compound-packs/storybook-testing/real-browser-axe-as-error.md`); release runs never cancel each other (`docs/solutions/tooling-decisions/pnpm-owns-the-changeset-ledger.md:109`); the coding agent's pre-PR UI evidence, gathered by using the built product the way its user does (Compound Engineering's ce-test-browser stage).

Rules in this pack govern:

- Every job that runs steps sets exactly the one 60-minute backstop, never a value above or below it, no shorter wall-clock kill exists (none passed through a caller's `with:`, none per unit of work), and each job writes its wall time to the step summary (`one-stuck-job-backstop`).
- A pull-request job reaches its first verdict step within 60 seconds: only checkout, one pinned tool fetch, a restore and a frozen install come before it (`setup-under-a-minute`).
- A commit-message, changeset or PR-title check runs its pinned tool directly, with no workspace install, dev shell or producer job before it (`light-checks-run-the-pinned-tool`).
- A workflow's pull-request gates (format, lint, typecheck, test, build) run in parallel inside one job with one checkout and one install; a split is kept only where the run shows it lowers wall time and each split job's task time exceeds its setup time (`gates-share-one-job`).
- No lint, typecheck or test job enters a Nix dev shell (`no-dev-shell-on-verdict-lanes`).
- A flake artifact is built on main only when its inputs change or its key misses, keyed on its input hash, and restored read-only by every pull-request job and every agent sandbox that can reach the cache; a public repo carries no credentials, and a private fleet repo uses a substituter only main pushes to (`flake-outputs-build-once-on-main`).
- The PR gate runs only what the diff affects, decided from the dependency graph against the right base (a pull request's base; on main, the last green main commit, never `HEAD~1`) with full history, never from a hand-kept path or package list, within 10 minutes, with no accessibility-only job outside the story run and no main-only suite, full VM test or machine-image build in any job a pull request reaches; the review of a CI-facing diff runs on ce-code-review's full path with every declared pack loaded (`pr-gate-runs-only-what-the-diff-affects`).
- Heavy suites, full VM tests and machine-image builds run on every push to main, never in a pull request, scoped from the lane's last green commit, and no push cancels another's run: main is the outer loop where parallel agents' changes first meet (`heavy-suites-judge-every-main-commit`).
- A red postsubmit verdict files a P0 the same day, naming its culprit only when the commit's parent is green, even for a push no pull request carries, and freezes merges except the fix; a revert PR opens only when attribution is confident (`red-main-reverts-its-culprit-same-day`).
- A release reads the lane's own workflow run for the push of the exact commit it releases, fails closed when it is missing or did not succeed, and promotes what it proved without rebuilding or retesting; a runner or machine image reaches the fleet only through the pipeline, after a canary runner built from it has taken real jobs through a stated bake period, with automatic rollback to the last known-good image (`release-promotes-the-staging-proven-build`).
- Every heavy lane states its runner-minutes per day at the repo's measured 7-day merge rate, priced on the run every push to main starts (`heavy-lanes-state-their-daily-minutes`).
- No CI job or test has the repo's own docs, plans or layout as its subject (`no-lane-grades-the-repos-own-docs`).

No tool enforces these judgments; each rule's gate is review.
