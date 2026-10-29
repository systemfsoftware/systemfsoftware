---
title: A failing check fails its job under its own name, other checks still report, and the job prints a rerun command
applies_when:
  - adding or changing a step or script that runs a check
  - adding continue-on-error, || true, or an if: to a step that runs a check
  - joining checks into one command, or adding a check that only warns
  - changing what a failing job reports
  - setting a rule or tool to warn instead of fail
  - a check fails, then passes on a rerun of the same commit
tags: [ci, failures, continue-on-error, warnings, reproduce, flaky]
---

A check step (lint, typecheck, test, build, guard) must fail its job on failure. Do not use `continue-on-error: true`, `|| true`, an `if:` condition, or exit-code rewrites to mask failures. Do not add checks that only warn, annotate, or report. A check fails the job or stays out of CI. Fowler: "Once you start ignoring a regression test failure, then that test is useless" (https://martinfowler.com/articles/nonDeterminism.html).

Run independent checks in separate named steps. Do not chain independent checks with `&&`. Use `&&` only between a producer and the consumer reading its output. In a script that runs multiple checks, execute every check and fail at the end if any failed.

Investigate a check that passes on rerun before calling it flaky. Runner faults (setup failures, spot reclaims, out-of-memory kills) do not count against the check. A seeded or property test failure is a finding until disproven by replay or shrinking: Fowler, nonDeterminism.html, footnote 3: "Tests seeded from a randomizer can help hunt out edge cases ... quite different from automated regression tests". Quarantine flaky regression tests out of the required presubmit set until fixed: Google requires "only fast, reliable ones" on presubmit (https://abseil.io/resources/swe-book/html/ch23.html); Fowler: "Place any non-deterministic test in a quarantined area. (But fix quarantined tests quickly.)". Osmani: flaky tests "become systemic blockers when forty agents hit the same flaky test simultaneously" (https://addyosmani.com/blog/code-agent-orchestra/).

Every failing, timed-out, or cancelled job must print the name of the failing check and a command to rerun it from the repository root. A link to logs is not a rerun command. A suite that runs only on main reproduces as a workflow dispatch on main.

Decision test: trace the diff's check steps as if the first check failed. Reject the diff if:

- A failed check leaves the job green, swallows its exit code, or runs in warning-only mode.
- Independent checks are chained with `&&`, skipping later checks when an earlier check fails.
- A failing job does not print the failing check's name and its root rerun command.
- A flaky regression test remains in the required check set.

Defect prevented: swallowed failures report false health. `&&` chains abort early, hiding whether subsequent checks pass and obscuring which check broke. Warning-only checks waste CI minutes because developers ignore them. Red jobs without rerun commands force developers to dig through logs to reproduce failures locally.

```yaml
# WRONG
- run: pnpm format:check && pnpm lint
  continue-on-error: true
- run: pnpm audit-docs || true # warns, never fails
```

```yaml
# RIGHT: each check is its own step, and the summary names every failed one with its rerun command
- id: lint
  run: pnpm lint
- id: typecheck
  run: pnpm typecheck
- if: failure() || cancelled()
  env:
    STEPS: ${{ toJSON(steps) }}
  run: |
    echo "$STEPS" | jq -r 'to_entries[] | select(.value.outcome != "success")
      | "\(.key) did not pass. Rerun from the repository root: pnpm \(.key)"' >> "$GITHUB_STEP_SUMMARY"
```

```sh
# RIGHT: one script that runs every check and fails if any failed
s=0; pnpm format:check || s=1; pnpm lint || s=1; pnpm typecheck || s=1; exit $s
```

Source: GitHub, "Workflow syntax", `jobs.<job_id>.steps[*].continue-on-error`: "Prevents a job from failing when a step fails. Set to `true` to allow a job to pass when this step fails" (https://docs.github.com/en/actions/reference/workflows-and-actions/workflow-syntax). Sadowski et al., "Lessons from Building Static Analysis Tools at Google", Communications of the ACM 61(4), 2018: the Clang team enabled a new diagnostic "as a compiler error (not a warning, which the Clang team found Google developers ignored) to break the build", and "When possible, checks are enabled as compiler errors" (https://research.google/pubs/lessons-from-building-static-analysis-tools-at-google/).

Gate: judge
