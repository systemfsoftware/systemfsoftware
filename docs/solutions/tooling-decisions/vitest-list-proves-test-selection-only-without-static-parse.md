---
title: "vitest list proves test selection only with --no-staticParse"
date: 2026-10-09
category: tooling-decisions
module: systemfsoftware
problem_type: tooling_decision
component: testing_framework
severity: medium
applies_when:
  - "Showing that a Vitest config change leaves the selected tests unchanged, by diffing `vitest list` output before and after"
  - "A package registers its tests at runtime: RuleTester suites, `makeFeature` Gherkin features, generated schema-law files"
retire_when: "Vitest's `vitest list` stops parsing files statically by default; check `vitest list --help` for the `--staticParse` default"
tags:
  - vitest
  - vitest-list
  - static-parse
  - test-selection
  - evidence
---

# vitest list proves test selection only with --no-staticParse

## Context

Vitest 5 (observed on 5.0.1) parses each test file statically when it runs `vitest list`, and does not execute the file. A test that only exists once the file runs is invisible to that parse. Examples are a `RuleTester.run(...)` call, a `makeFeature` feature, or a generated `schema-laws.test.ts`. For each such file, Vitest prints `Error: No test suite found in file …` and lists none of its tests.

Many packages in this repo register their tests at runtime. On `@systemfsoftware/oxlint-plugin-dmmf-workflow`, a plain `vitest list` prints 8 `No test suite found` errors and lists 0 tests. `vitest list --no-staticParse` lists 252. A before/after diff of plain `vitest list` therefore compares error text on both sides. It passes whether or not the change moved any tests.

## Guidance

To prove that test selection did not change, capture each config both ways, on both trees, and diff the sorted outputs:

```bash
vitest list --no-staticParse --config <config>              # every test, collected by running the files
vitest list --no-staticParse --filesOnly --config <config>  # every test file
```

- Run every config file a package has, not only `vitest.config.ts`. Some packages, such as effect-atom and storybook-gherkin, also have a `vitest.node.config.ts` that Stryker runs alone.
- Capture with a cleaned environment (`env -u AGENT -u CI`) unless the lane itself is the subject, so that tier variables don't add noise.
- Build the "before" tree in a scratch worktree outside the working tree, and remove it afterwards.
- A file count that matches while the test list differs points at a collection failure, not a selection change. During the shared vitest-config restore (#696), the scratch baseline at main could not collect effect-atom-react's browser project (`Failed to import test file …/packages/runner/vitest/dist/guard.mjs`). On that same commit, main's own CI ran all 14 files and 63 tests. Before you call such a difference a regression, compare its per-file counts against the CI test job log for the baseline commit.

## Why This Works

**Invariant: an equivalence check is evidence only if the thing that can move is visible to it.** The static parse hides runtime-registered tests, so a plain `vitest list` maps "tests dropped" and "tests kept" to the same output, and its diff can't fail. `--no-staticParse` collects each file by running it, so every registered test reaches the output, and a dropped or moved test shows up as a diff line.

## When to Apply

- When you restore, inline or restructure shared Vitest configs, or change project splits or lanes.
- When a PR or brief requires the per-package `vitest list` output to be identical.

## Examples

The #696 capture covered 42 configs × {list, files} × {default, `VITEST_LANE=pr`}. 40 configs matched exactly. The two differences were a deleted plugin's own test file (9 tests), and effect-atom-react's baseline collection failure described above, which main's CI log resolved.

## Related

- `docs/solutions/test-failures/jsdoc-vitest-fence-marks-source-as-test.md`: `vitest list` as the way to find a source file that was collected as a test.
- `docs/solutions/tooling-decisions/turbo-cache-requires-complete-input-hash.md`: proving test tasks actually ran, not replayed from cache.
