---
title: Agent-facing mutation output is a file plus bounded prose
date: "2026-08-27"
category: architecture-patterns
module: stryker-js-cli
problem_type: architecture_pattern
component: testing_framework
severity: high
applies_when:
  - "A mutation or test job must be diagnosed by an agent from CI logs"
  - "CI=1 and AGENT=1 both mean machine-readable plus bounded human progress"
related_components:
  - stryker-js-cli
  - stryker-js-platform-node
  - stryker-js-vitest-runner
tags:
  - agent-output
  - mutation
  - ci-logs
  - ndjson
---

# Agent-facing mutation output is a file plus bounded prose

## Context

A Mutation job for one oxlint plugin produced a 56 MB, 303k-line log and timed out at 15 minutes with `completed: 0` of 2075 mutants. Vitest was running; the orchestrator never recorded a result. The agent could not find the timeout in the haystack.

Two independent defects produced that log:

1. Child vitest mutation runs inherited the default reporter and printed every test, twice, per mutant.
2. Progress ticks only counted actionable statuses (survived, timeout, no-coverage). Killed mutants — the common case — never advanced `completed`.

## Guidance

Console is not a JSON log. Put the machine stream in a report file next to the HTML and JSON reports. Print at most: phase, a count line, twenty surviving mutants, a verdict. Count every finished mutant.

Child test runners used as mutation oracles must not print. Direct test runs under `AGENT` stay `passed-only` with bail. Do not attach GitHub Actions annotations to every passing test.

If the human renderer taps a stream that is later filtered to machine events only, human mode prints nothing. Tap first, then filter.

A hard kill can leave the stream file without a closing verdict. Treat a missing report as infrastructure failure, not a score.

## Applicability

Any agent-consumed CI log that currently dumps a child runner's full output. The same split (file for the machine, bounded prose for the person) applies to `CI=1` and `AGENT=1`.
