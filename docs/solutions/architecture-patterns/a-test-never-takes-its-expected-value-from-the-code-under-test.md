---
title: A test never takes its expected value from the code under test
date: 2026-09-23
category: architecture-patterns
module: constitution corpus
problem_type: architecture_pattern
component: tooling
severity: high
applies_when:
  - a test's expected value was recorded from, or computed by, the code under test
  - a snapshot, golden file, or build-to-build comparison is proposed as a committed test
root_cause: the code under test on both sides of the assertion
tags: [constitution, characterization, snapshot, differential, testing, oracle]
---

## The defect

A test whose expected value came from the code under test is a tautology: it asserts that the
code equals itself, so it passes whether or not the code is right. It shows up under three names:

- a snapshot or golden file recorded from the code's current output
- an approval test that replays a legacy script's output as the specification
- a differential that compares the code against another build or version of itself

## Where the corpus says it

One line in CONST-T10, `dont`: "compute or record the expected value by running the code under
test, or any build or version of it". Recording an expected value is computing it by running the
code earlier, so all three names above fall under that line.

CONST-T9 covers the two legitimate neighbours: comparing old and new during a migration until they
agree, then deleting the old; and persisted gold that is externally authored and independently
gated. A comparison against a genuinely independent implementation is an oracle under CONST-T10,
not a tautology.

## Enforcement

Review only. On 2026-09-23 no snapshot-API lint existed in this repo, in
`systemfsoftware/are-the-types-wrong`, or in `systemfsoftware/systemfsoftware`. A mechanical check
belongs to whoever owns the lint instruments, not to the author of the rule (CONST-E9).
