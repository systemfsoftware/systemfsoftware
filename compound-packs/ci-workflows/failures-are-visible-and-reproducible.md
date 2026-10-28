---
title: A failing check fails its job under its own name, every other check still reports, and the job says how to rerun it
applies_when:
  - adding or changing a step or script that runs a check
  - adding continue-on-error, || true, or an if: to a step that runs a check
  - joining checks into one command, or adding a check that only warns
  - changing what a failing job reports
  - setting a rule or tool to warn instead of fail
  - a check fails, then passes on a rerun of the same commit
tags: [ci, failures, continue-on-error, warnings, reproduce, flaky]
---

A verdict step is a step whose outcome is a check's result: lint, typecheck, a test, a build, a guard.

A verdict step's failure fails its job. No verdict step carries `continue-on-error: true`, `|| true`, an `if:` or an exit-code rewrite that lets its failure pass. A check that only warns, annotates or reports without ever failing a job is not added; a check fails the job or is not in CI. That includes a rule or tool set to warn by its own severity settings, a report-only mode, and output only as an annotation or comment. Fowler: "Once you start ignoring a regression test failure, then that test is useless" (https://martinfowler.com/articles/nonDeterminism.html).

Independent checks are separate named steps or tasks, never joined with `&&`. A script that runs several checks runs every one and fails at the end if any failed. `&&` joins only a producer to the consumer that reads its output.

A failure that passes on rerun is read before it is called flaky. A failure in a setup step, a spot reclaim or an out-of-memory kill is a runner fault and does not count against the check. A seeded or property test that fails on one seed is a finding until its shrunk input or replay seed shows otherwise: Fowler, nonDeterminism.html, footnote 3: "Tests seeded from a randomizer can help hunt out edge cases ... quite different from automated regression tests". A regression test that is truly flaky leaves the required set until fixed: Google, "only fast, reliable ones" on presubmit (https://abseil.io/resources/swe-book/html/ch23.html); Fowler, "Place any non-deterministic test in a quarantined area. (But fix quarantined tests quickly.)". Osmani: flaky tests "become systemic blockers when forty agents hit the same flaky test simultaneously" (https://addyosmani.com/blog/code-agent-orchestra/).

A failing job, including one that times out or is cancelled, ends by writing which check failed and a command that reruns that check from the workspace root. A link to the log is never the reproduce command. A suite that runs only on main reproduces as a dispatch of its workflow on main.

Decision test: in the diff, make the first check in each job it touches fail. The diff fails when the job still goes green, when a later independent check no longer runs or no longer reports under its own name, when the job's output does not name the failed check and a command that reruns it, or when the diff adds a check that cannot fail a job, sets a rule to warn, or leaves a truly flaky check in the required set.

Defect prevented: a swallowed failure reports health the lane does not have. A chain stops at the first failure, so later checks report nothing and the platform names the launcher instead of the check. A warning-only check is ignored, so it costs runner time and catches nothing. A red job without a rerun command sends the reader into the logs to guess.

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

```json
// RIGHT: one script that runs every check and fails if any failed
"check": "s=0; pnpm format:check || s=1; pnpm lint || s=1; pnpm typecheck || s=1; exit $s"
```

Source: GitHub, "Workflow syntax", `jobs.<job_id>.steps[*].continue-on-error`: "Prevents a job from failing when a step fails. Set to `true` to allow a job to pass when this step fails" (https://docs.github.com/en/actions/reference/workflows-and-actions/workflow-syntax). Sadowski et al., "Lessons from Building Static Analysis Tools at Google", Communications of the ACM 61(4), 2018: the Clang team enabled a new diagnostic "as a compiler error (not a warning, which the Clang team found Google developers ignored) to break the build", and "When possible, checks are enabled as compiler errors" (https://research.google/pubs/lessons-from-building-static-analysis-tools-at-google/).

Gate: judge
