---
title: The PR gate runs only what the diff affects, decided from the build graph, within 10 minutes
applies_when:
  - adding or changing a job a pull request triggers, or what a pull-request lane runs
  - adding or changing a workflow's `pull_request` trigger or its `paths` filter
  - deciding what a pull-request job runs from the files a diff touches, or adding a hand-kept list of packages or paths to run
  - choosing the base commit an affected-only run compares against, or the checkout depth it uses
  - adding, moving or removing an accessibility check in CI
  - adding a full VM test or a machine-image build to a workflow a pull request can reach, or to a flake's `checks`
  - reviewing a diff that changes a workflow, an action, a CI-facing flake output, runner configuration, a machine-image build or a deploy pipeline
tags: [ci, workflows, presubmit, scope, build-graph, wall-clock, machine-image, deploy, review]
---

A pull-request job that runs whatever the diff touched, rather than what it affects, spends the author's wait on work that cannot change the verdict. This repo's CI runs real-microVM smoke journeys of effect-microsandbox on every pull request outside the docs set: on #734, whose diff was three `.changeset/` files, the smoke job took 89 seconds (run 38087205456). The rest of the same CI decides from the build graph: the test planner reads turbo's dry run and the Nix lane compares derivations, and whole CI runs on pull requests took 2.8 to 4.7 minutes (runs 38107172888, 38108809753, 38112410726, 38113206446, 38113391870).

A coding agent asked to "make CI catch it" can put main-only work in presubmit, and then every pull request waits on it with no extra verdict on the diff. An unnamed private repo, 2026-10-12: a full NixOS VM test of 25-40 minutes on hosted runners ran on every pull request, and three machine-image builds of 27 minutes or more ran on pull requests that touched Nix paths, each one alone past this gate's 10 minutes.

A coding agent asked to make CI faster can reach for a path filter or a list of packages to run. That list is a second copy of the dependency graph, kept by hand, and it drifts: this repo's storybook-gherkin browser suite runs on a pull request only when `packages/gherkin/storybook-gherkin/**` or its own workflow changes (`storybook-gherkin-browser.yml:9-13`), while the package depends on nine workspace packages (`packages/gherkin/storybook-gherkin/package.json`, `workspace:^`), so a change to any of them never reaches it. An agent that diffs a main push against `HEAD~1` misses work another way: when the previous push's run failed or never ran, the commits since the last green one are never judged.

A CI-facing diff reviewed without this pack is a diff nobody checked against it. Packs are applied only on ce-code-review's full path: "a diff that takes the lite or focused path is not checked against packs, and its receipt says so". A coding agent that routes a workflow, flake, image or deploy change through a lighter review gets a clean verdict from a review that never read these rules, and the PR merges carrying every pattern they condemn.

## Rule

The PR gate runs only what the diff affects, decided from the build graph: lint and typecheck, property tests, public-API feature tests with IO emulated, and the changed Storybook stories with their interaction, a11y and visual checks. It fits in 10 minutes. Heavy suites (full-stack e2e, full corpus, mutation), full VM tests and machine-image builds are main-only and never run in any job a pull request reaches (`heavy-suites-judge-every-main-commit`), and no CI job has accessibility as its only subject outside the story run. The review of a CI-facing diff runs on ce-code-review's full path with the repo's declared packs loaded.

- **From the graph:** what is affected comes from the repo's dependency graph (a task runner's affected or dry-run output, or derivations compared with the base's), never from a package or path list the workflow maintains by hand. A repo with no dependency graph may use path filters until it has one.
- **Every input in the graph:** a file CI runs or tests that no package owns (a root script, a tools directory) is declared in the graph, as a package or in the task runner's repo-wide inputs (turbo's `globalDependencies`), so a change to it is affected. An affected run that selects nothing runs nothing and passes: turbo 2.11.5 given a filter that selects no package prints "No tasks were executed as part of this run" and exits 0. In this repo `scripts/tools/*.ts` sit outside every package and `turbo.json:4-5` declares only `scripts/tools/patch-tsgo-if-needed.mjs`, so the graph never selects them; they are judged only because the `plan` lane runs `deno test ... scripts/tools/` on every run, not from the graph (`.github/actions/checks-lane/action.yml:23-26`).
- **Against the right base:** a pull request compares against its base commit. A push to main compares against the last main commit whose run of the same workflow succeeded, after checking that commit is an ancestor, never against `HEAD~1`; when no such commit is found, everything runs.
- **With the history it needs:** the job checks out full history (`fetch-depth: 0`; `filter: tree:0` is acceptable to keep the clone small), not a shallow clone the comparison cannot see past.
- Where a repo's plan adopts GitHub's native merge queue, it may be used; this rule does not require one.
- **Review with the packs loaded:** the review of a diff that changes a workflow, an action, a CI-facing flake output, runner configuration, a machine-image build or a deploy pipeline runs on ce-code-review's full path, and its receipt, carried in the PR body, lists every pack the repo declares as loaded, ci-wall-clock among them. A receipt that says no pack loaded, or names the lite or focused path, fails: this pack judged nothing. Which rules apply is decided by each rule's `applies_when` matched to the change, never by a path list alone.

The 10 minutes is measured from the run and written to its step summary (`one-stuck-job-backstop`). Review checks what the diff makes the gate run and how it decides.

```yaml
# WRONG: systemfsoftware/systemfsoftware 02bf9653b1:.github/workflows/ci.yml:86-91
# Runs on every pull request outside the docs set, whatever it changed: 89 s on #734,
# a diff of three .changeset/ files (run 38087205456).
  smoke:
    name: smoke · effect-microsandbox journeys (real microVM)
    needs: [conflicts, scope]
    if: needs.scope.outputs.scope != 'docs-only'
    runs-on: ubuntu-latest
    timeout-minutes: 30

# WRONG: systemfsoftware/systemfsoftware 02bf9653b1:.github/workflows/storybook-gherkin-browser.yml:9-13
# What is affected is decided by a path filter, not by what depends on the change.
  pull_request:
    branches: [main]
    paths:
      - "packages/gherkin/storybook-gherkin/**"
      - ".github/workflows/storybook-gherkin-browser.yml"

# WRONG: unnamed pattern, a private product repo (org CI audit, 2026-10-11)
# A separate accessibility journeys lane, outside the story run, on every code pull request.

# RIGHT: systemfsoftware/systemfsoftware 02bf9653b1:.github/workflows/reusable-checks.yml:272-273
# On a pull request the planner reads turbo's dry run, so a package whose task hash is
# already passed or cached is skipped.
          if [ -z "$DRY_RUN" ] && [ "$source" = built-in ] && [ "$EVENT" = pull_request ] && [ "$SCOPE" != docs-only ]; then
            DRY_RUN="$PNPM exec turbo run test --dry=json"

# RIGHT: systemfsoftware/systemfsoftware 02bf9653b1:.github/workflows/reusable-nix.yml:129-132
# A flake output builds only when its derivation differs from the base commit's.
          # An output builds unless the base commit evaluated it to the same derivation.
          jq -c --slurpfile b "$out/base.json" '
            def changed($base; $kind):
              [(.[$kind] // {}) | to_entries[] | select(.value == null or .value != (($base[$kind] // {})[.key])) | .key];

# WRONG: neutral shape of an unnamed pattern (2026-10-12). Pull requests that touch Nix paths
# build three machine images, 27 minutes or more each.
on:
  pull_request:
    paths: ["nix/**"]
jobs:
  image:
    strategy:
      matrix:
        image: [runner, builder, cache]
    steps:
      - run: nix build ".#images.${{ matrix.image }}"

# RIGHT: neutral shape, no citation. The flake keeps the VM test and the images out of
# `checks` (under `packages`, which flake check evaluates but does not build), so the pull
# request's flake check still builds every ordinary check, substituting what main cached,
# and never builds the VM test or an image; main builds those by name.
      - run: nix flake check

# RIGHT: neutral shape, no citation. Full history, the base chosen by event, and the task
# runner's graph deciding what runs; no package or path is named in the workflow.
  affected:
    runs-on: ubuntu-latest
    timeout-minutes: 60
    permissions:
      contents: read
      actions: read # the base lookup lists this workflow's runs
    steps:
      - id: start
        run: echo "at=$(date +%s)" >> "$GITHUB_OUTPUT"
      - uses: actions/checkout@v7
        with:
          fetch-depth: 0
          filter: tree:0
      - uses: actions/setup-node@v6
        with:
          node-version: 24
      - run: corepack pnpm install --frozen-lockfile
      - id: base
        env:
          GH_TOKEN: ${{ github.token }}
          PR_BASE: ${{ github.event.pull_request.base.sha }}
          WORKFLOW: ${{ github.workflow_ref }} # owner/repo/.github/workflows/<file>@<ref>
        run: |
          if [ -n "$PR_BASE" ]; then base="$PR_BASE"; else
            # Last main push whose run of this workflow succeeded, never HEAD~1.
            file="${WORKFLOW%@*}"; file="${file##*/}"
            # A failed lookup degrades to running everything, never to a failed gate.
            base="$(gh api "repos/$GITHUB_REPOSITORY/actions/workflows/$file/runs?branch=main&event=push&status=success&per_page=1" \
              --jq '.workflow_runs[0].head_sha // empty')" || base=""
            git merge-base --is-ancestor "$base" HEAD 2>/dev/null || base=""   # none found: run everything
          fi
          echo "sha=$base" >> "$GITHUB_OUTPUT"
      - env:
          BASE: ${{ steps.base.outputs.sha }}
        run: |
          ./bin/dprint check & format=$!   # the formatter's check is a pinned tool, not a turbo task
          set -- lint typecheck test build --continue   # the turbo gates of `gates-share-one-job`
          if [ -n "$BASE" ]; then set -- "$@" "--filter=...[$BASE]"; fi   # changed packages and their dependents
          status=0
          corepack pnpm exec turbo run "$@" || status=$?
          wait "$format" || status=1
          exit "$status"
      - if: always()
        env:
          STARTED: ${{ steps.start.outputs.at }}
        run: |
          echo "wall time: $(( $(date +%s) - STARTED )) s" >> "$GITHUB_STEP_SUMMARY"
```

Grounds: `.github/AGENTS.md:36`: "The test planner skips a package whose turbo hash a remote cache or a passed run already holds, and nix builds only outputs whose `drvPath` differs from the base commit's". _Software Engineering at Google_ ch. 23 (https://abseil.io/resources/swe-book/html/ch23.html): "So, which tests should be run on presubmit? Our general rule of thumb is: only fast, reliable ones." Google Testing Blog, "Efficacy Presubmit", 2018-09-17 (https://testing.googleblog.com/2018/09/efficacy-presubmit.html): 'a "missed failure" at presubmit is not a critical failure. The test will still be run at continuous build, and then rolled back if it fails.' Nx, "Monorepo CI best practices" (https://nx.dev/docs/kb/monorepo-ci-best-practices), on hand-kept path filters: "Developers forget to update the filters when projects and dependencies change, so the pipeline goes green on a change it never tested"; on graph-based affected detection: "Nothing is maintained by hand, so it can't drift from what the code actually does"; on the base: "On a push to the main branch, comparing against HEAD~1 is wrong. If the previous run failed or never ran, the work from that commit is never verified. Compare against the last commit that produced a successful pipeline"; its example checks out with `fetch-depth: 0` and `filter: tree:0`, and its review prompt says to "flag a shallow checkout, since change detection needs history". Nix manual, `nix flake check` (https://nixos.org/manual/nix/stable/command-ref/new-cli/nix3-flake-check.html): the command "verifies that the flake specified by flake reference flake-url can be evaluated successfully (as detailed below), and that the derivations specified by the flake's checks output can be built successfully"; its evaluation checks list `packages` among the outputs that "must be derivations", which it evaluates, while only the `checks` derivations are built. That is why the RIGHT above moves the VM test and the images out of `checks` instead of passing `--no-build`, which would also stop every ordinary check from building; the manual gives `--no-build` as the way to "Verify that the patchelf flake evaluates, but don't build its checks".

Grounds for the review check: Compound Engineering, "Compound Packs" (https://every.to/compound-engineering/guides/packs): `ce-code-review` "flags it against the same rule on its full review path (a diff that takes the lite or focused path is not checked against packs, and its receipt says so)", and "`applies_when` conditions are matched **semantically** by the agent against the work being planned or reviewed — they are not regexes", which is why applicability lives in each rule's `applies_when`, not in a path list.

Gate: `review`. Does a pull-request job in the diff run something the diff does not affect, decide what is affected from a path instead of the build graph, run a heavy suite (full-stack e2e, full corpus, mutation), or have accessibility as its only subject outside the story run? In a repo with a dependency graph (a workspace task runner, or flake derivations), does a job in the diff choose what to run from a package or path list it maintains by hand (`paths:` filters, a hard-coded package list, a `--filter` naming packages) instead of the graph's affected output? Does the diff add, move or change a file a CI job runs or tests that sits outside every package and outside the task runner's repo-wide inputs, so the affected set can never select it? Does a main-push job compare against `HEAD~1`, `github.event.before` or anything but the last main commit whose run of the same workflow succeeded, checked as an ancestor? Does its base lookup name a workflow file other than the one it runs in, or fail the job when the lookup fails instead of running everything? Does an affected computation run on a checkout or fetch without full history (`fetch-depth` other than 0, or `git fetch --depth`)? Can a `pull_request` trigger in the diff reach, directly, through `needs:` or through a called reusable workflow, a job that runs a main-only suite, a full VM test or a machine-image build, including a flake that puts a full VM test or an image under `checks` where a pull request runs `nix flake check`? For a diff that changes a workflow, an action, a CI-facing flake output, runner configuration, a machine-image build or a deploy pipeline: does the PR body carry a full-path ce-code-review receipt listing every declared pack as loaded, ci-wall-clock among them? A missing receipt, or one that says no pack loaded or names the lite or focused path, fails.
