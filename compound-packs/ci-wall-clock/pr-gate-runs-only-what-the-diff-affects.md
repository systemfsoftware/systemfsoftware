---
title: The PR gate runs only what the diff affects, decided from the build graph, within 10 minutes
applies_when:
  - adding or changing a job triggered on pull_request, or what a pull-request lane runs
  - deciding what a pull-request job runs from the files a diff touches
  - adding, moving or removing an accessibility check in CI
tags: [ci, presubmit, scope, build-graph, wall-clock]
---

A pull-request job that runs whatever the diff touched, rather than what it affects, spends the author's wait on work that cannot change the verdict. This repo's CI runs real-microVM smoke journeys of effect-microsandbox on every pull request outside the docs set: on #734, whose diff was three `.changeset/` files, the smoke job took 89 seconds (run 38087205456). The rest of the same CI decides from the build graph: the test planner reads turbo's dry run and the Nix lane compares derivations, and whole CI runs on pull requests took 2.8 to 4.7 minutes (runs 38107172888, 38108809753, 38112410726, 38113206446, 38113391870).

## Rule

The PR gate runs only what the diff affects, decided from the build graph: lint and typecheck, property tests, public-API feature tests with IO emulated, and the changed Storybook stories with their interaction, a11y and visual checks. It fits in 10 minutes. Heavy suites (full-stack e2e, full corpus, mutation) never run on a pull request (`heavy-suites-judge-every-main-commit`), and no CI job has accessibility as its only subject outside the story run.

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
```

Grounds: `.github/AGENTS.md:36`: "The test planner skips a package whose turbo hash a remote cache or a passed run already holds, and nix builds only outputs whose `drvPath` differs from the base commit's". _Software Engineering at Google_ ch. 23 (https://abseil.io/resources/swe-book/html/ch23.html): "So, which tests should be run on presubmit? Our general rule of thumb is: only fast, reliable ones." Google Testing Blog, "Efficacy Presubmit", 2018-09-17 (https://testing.googleblog.com/2018/09/efficacy-presubmit.html): 'a "missed failure" at presubmit is not a critical failure. The test will still be run at continuous build, and then rolled back if it fails.'

Gate: `review`. Does a pull-request job in the diff run something the diff does not affect, decide what is affected from a path instead of the build graph, run a heavy suite (full-stack e2e, full corpus, mutation), or have accessibility as its only subject outside the story run?
