---
title: A failure-corpus fixture that spells its repo path fails Stryker's dry run in the sandbox
date: 2026-09-26
category: test-failures
module: effect-daemon-spec
problem_type: test_failure
component: testing_framework
symptoms:
  - "Mutation job for effect-daemon-spec exits 3 with 'Initial test run failed. 1 of 237 test(s) failed' and zero mutants"
  - "The failing scenario is the failure-corpus test; the record's paths start with packages/daemon/effect-daemon-spec/.stryker-tmp/sandbox-XXXX/"
  - "expected { name: 'SupervisorTerminated', …(7) } to match object { …(6) } — namesDefectFile false, firstLocationFile names the sandbox copy"
root_cause: test_isolation
resolution_type: test_fix
severity: medium
tags:
  - failure-record
  - failure-corpus
  - stryker
  - sandbox
  - mutation
  - provided-workspace-root
---

# A failure-corpus fixture that spells its repo path fails Stryker's dry run in the sandbox

## Problem

A failure-corpus fixture (`CorpusFixture`) asserts that a rendered failure record names the defect file (`namesDefectFile`) and starts at the raising frame (`firstLocationFile`). Most fixtures spell that file's workspace-relative path as a string literal. Stryker runs the package from a copy it creates at run time in a `sandbox-XXXX` directory under the package's `.stryker-tmp` directory. The record prints paths relative to the workspace root, which is still the real repo root, so inside the sandbox it prints the sandbox path. The literal stops matching, the dry run fails, and the Mutation job exits 3 before it tests a single mutant.

The `giveUp` fixture in `effect-daemon-spec` was the first to fail (Mutation run 36222008526), because that package is the only one with both a failure corpus and a Stryker config. The corpora of `effect-cell-types`, `effect-spec-runtime`, `effect-gherkin-spec`, `storybook-gherkin`, `vitest`, `conformance-spec`, `differential-spec` and `trace-spec` spell their paths the same way and will fail the same way once those packages are mutated.

## Symptoms

- The Mutation job log shows `ERROR (#1): Initial test run failed`, then a failure record whose `raised at` path contains `.stryker-tmp/sandbox-`, then `[ELIFECYCLE] Command failed with exit code 3`.
- The same test passes under a normal `vitest run`, so the fixture looks correct.

## What Didn't Work

- Re-running the job: the sandbox directory name changes each run and never equals the literal.

## Solution

The fixture derives the path the way the renderer prints it. The renderer's `relativize` strips `` `${root}/` `` from every path, and `root` is the value `providedWorkspaceRoot()` reads from vitest's `inject`. The fixture applies the same rule to its own module URL:

```ts
import { providedWorkspaceRoot } from '@systemfsoftware/vitest/failure'
import { Option } from 'effect'
import { fileURLToPath } from 'node:url'

const thisFile = fileURLToPath(import.meta.url)

const defectFileAsRecordPrints = Option.match(Option.fromNullishOr(providedWorkspaceRoot()), {
  onNone: () => thisFile,
  onSome: (workspaceRoot) => thisFile.replace(`${workspaceRoot}/`, ''),
})
```

The `giveUp` fixture carries this change on branch `fix/daemon-spec-corpus-sandbox-path` (pending merge).

## Why This Works

Invariant: **an expected path in a test is computed with the same function and the same inputs the code under test uses, never spelled.**

- The renderer's input is (workspace root, absolute frame path). The shared vitest config's `workspaceRoot` walks up to `pnpm-workspace.yaml`, so the provided root is identical in the real tree and in any nested copy.
- The fixture's input is (the same provided root, `import.meta.url`). Inside a copy, `import.meta.url` is the copy's file, the same file the stack frame names.
- Same function, same inputs, same output, in every checkout layout. The assertions stay exact: equality on `firstLocationFile`, substring on `namesDefectFile`.

A spelled literal is correct only for the one checkout layout it was copied from.

## Prevention

- Rule, gated by `review`: a corpus fixture in any package that has a Stryker config derives its defect path from `import.meta.url` and `providedWorkspaceRoot()`.
  - wrong: `const defectFile = 'packages/<pkg>/tests/__fixtures__/failure-corpus/<file>.ts'`
  - right: the `defectFileAsRecordPrints` derivation above
- Check it without starting a mutation run. REPO-D3 refuses agent-started mutation runs, so reproduce the sandbox layout instead: copy the package, without `node_modules`, to a nested directory inside itself, symlink `node_modules` into the copy, and run the corpus test with the copy's `./node_modules/.bin/vitest run`. A spelled path fails there exactly as it does in Stryker's dry run.

## Related Issues

- Mutation run https://github.com/systemfsoftware/systemfsoftware/actions/runs/36222008526 (effect-daemon-spec job)
- The failure corpus came from #551
