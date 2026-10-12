# Turbo Task Graph Compound Pack

Judgment for repositories that build with Turborepo. Turbo already knows which tasks a change affects, what each task's inputs are and which results it has cached, so CI and release jobs ask turbo instead of keeping a second answer in a classifier, a package list or a hash record of their own.

The pack applies to a repository with a root `turbo.json`, whatever else it enrols, and loads in any such repository that names it in its CE config. It is published apart from `ci-wall-clock`, whose enrolment stays in systemfsoftware/systemfsoftware, so a turbo repository can take this rule without the rest of that pack. Packs are declared, never scanned (https://every.to/compound-engineering/guides/packs): enrol it with a git source pinned to a full commit SHA that publishes `turbo-task-graph`, adding the id and the `ref` bump in one commit, since an id the pinned commit does not publish drops the whole entry. Never use a `tree/main` URL, which freezes at whatever each machine cached first.

Packs are checked only on ce-code-review's full path, and its depth gate can send a CI-facing change to the focused path, which loads no packs, so the review of such a diff is invoked as `ce-code-review mode:agent base:origin/main depth:full`.

Each rule's `applies_when` names the situations it governs, and review matches them to the change by meaning. The tags `turbo`, `ci`, `caching` and `task-graph` let resolution by tag find the pack. Each rule's id is `turbo-task-graph/<file slug>`. A slug is never renamed; a retired rule is deleted outright and its id is never reused.

What other owners already cover is not repeated here. Where systemfsoftware's `ci-wall-clock` pack is enrolled, it governs which base an affected-only run compares against and how a pull request's gate is scoped (https://github.com/systemfsoftware/systemfsoftware/blob/8d071180798f9ea82ef5a4fd877152dacc02f6b6/compound-packs/ci-wall-clock/pr-gate-runs-only-what-the-diff-affects.md), and where a public or private repository keeps a built artifact (https://github.com/systemfsoftware/systemfsoftware/blob/8d071180798f9ea82ef5a4fd877152dacc02f6b6/compound-packs/ci-wall-clock/flake-outputs-build-once-on-main.md). A turbo task whose inputs are incomplete caches a wrong result (`docs/solutions/tooling-decisions/turbo-cache-requires-complete-input-hash.md` in systemfsoftware/systemfsoftware).

Rules in this pack govern:

- Which tasks a CI or release job runs, which packages a change touched, and which results it reuses (`selection-and-caching-go-through-turbo`).

No tool enforces these judgments; each rule's gate is review.
