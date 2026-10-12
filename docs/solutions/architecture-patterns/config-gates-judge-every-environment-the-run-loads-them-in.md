---
title: A Gate That Executes a Config Must Run It in Every Environment the Run Loads It In
date: "2026-10-12"
category: architecture-patterns
module: scripts/tools test-timings mutation plan
problem_type: architecture_pattern
component: testing_framework
severity: high
applies_when:
  - "a gate admits code by importing or executing it (a config probe, a dry run, a plan step) instead of parsing it"
  - "the admitted code later runs in a job whose environment differs from the gate's: CI flags, shard variables, file-command paths"
  - "one admission decision covers several run shapes the gate cannot tell apart in advance"
symptoms:
  - "a config that branches on an environment variable passes the gate and widens in the job"
  - "the gate's verdict is correct for the environment it ran in and wrong for the one that ships"
root_cause: the gate judged the config in one environment and the run loaded it in another, so any value the config read from the environment escaped the check
tags:
  - mutation
  - stryker
  - gate
  - config-probe
  - environment
  - job-shape
  - admission
---

# A Gate That Executes a Config Must Run It in Every Environment the Run Loads It In

## Problem

The Mutation plan (`test-timings plan --task mutation`) admits a package only if its `stryker.config.*` inherits `sharedConfig.mutate` from `@systemfsoftware/stryker-config` untouched. A Node probe (`mutation-probe.mjs`) imports the config and compares `mutate` to `sharedConfig.mutate` by identity. Importing is the right choice, because it sees what Stryker sees: spreads, pushes onto the shared array, and `stryker.conf.*` shadowing `stryker.config.*`. It also makes the verdict a function of the environment the probe runs in. Review of #747 found three wrong environments in a row, each admitting a config that widened in the real Mutation job.

## Failure Modes

1. **Stripped environment.** The probe had only `PATH`, `HOME` and cache directories. `mutate: process.env.CI ? ['src/**/*.ts'] : sharedConfig.mutate` read the inherited branch at the gate and the wide branch in CI.
2. **Withheld names the job defines.** The probe got the job's variables minus `STRYKER_SHARD` and the GitHub file-command paths. The job runner in `mutation-job.ts` always sets `STRYKER_SHARD`, so a config gated on it being set was admitted. A reviewer reproduced it widening in all ten shards.
3. **One stand-in value for two shapes.** The probe set `STRYKER_SHARD=1/1`. A whole-package job passes `''`, so a config gated on the variable being empty was admitted, and it widened in the most common job shape.

Each fix closed the case in front of it and opened the opposite one. The shared defect was the premise that one environment could stand in for every run:

$$\text{verdict}(c, E_\text{gate}) = \text{admit} \;\not\Rightarrow\; \forall E \in \text{Runs}: \text{verdict}(c, E) = \text{admit}$$

## Architectural Invariants

- **Run-shape coverage.** The gate evaluates the subject once per environment class the run can load it in, and admits it only if every evaluation admits it. Here that set is `JOB_SHAPES` (`''` for a package run whole, `'1/1'` for a shard). The probe facts are a `Record<JobShape, ProbeFacts>`, so no shape can be skipped or probed twice.
- **Inherit, then override for safety only.** The child gets the plan job's own environment, shaped the way a Mutation job runs Stryker (`CI` included). It differs only where the gate must protect itself or pin the tool: the file-command paths (`GITHUB_OUTPUT` and the rest) point at the child's own existing files, so a config that writes to them cannot replace the plan's `jobs` output, and pnpm is told not to manage its own version (`pnpmEnv`).
- **Attribute every refusal to the shapes that gave it.** `refusalsOf` reports each shape's refusals, merges identical ones, and names every shape (`when STRYKER_SHARD is '' or '1/1'`). A refusal labelled with one shape reads as if the other shape escaped it.
- **Declared limit.** Code written to detect the probe (keyed on `GITHUB_JOB`, a shard index other than `1/1`, or the probe's own values) passes any finite set of environments. The invariant stops ordinary environment branching. It is not a sandbox, and the doc and the gate both say so, so reviewers do not chase an unbounded set.

```ts
// before (abridged): one environment, a hand-picked allowlist
const pnpmEnv = () => ({
  PATH,
  HOME,
  XDG_CACHE_HOME,
  XDG_DATA_HOME,
  COREPACK_HOME,
  npm_config_manage_package_manager_versions: 'false',
})

// after: the plan job's environment, once per job shape
const pnpmEnv = (scratch: string, shard: JobShape) => ({
  ...Deno.env.toObject(),
  ...Object.fromEntries(FILE_COMMANDS.map((name) => [name, join(scratch, name)])),
  STRYKER_SHARD: shard,
  npm_config_manage_package_manager_versions: 'false',
})
const probes: Record<JobShape, ProbeFacts> = { '': await probed(pkg, ''), '1/1': await probed(pkg, '1/1') }
```

## Why This Works

A config that reads the environment is ordinary code, not an attack: `process.env.CI ? … : …` is a common idiom. The gate's claim is about the run, so the evaluation has to cover the run's inputs. If one class is missing, the gate certifies a branch that never executes. The failure is also silent: the plan exits 0, the job mutates the wider set, and a Stryker `break` shows only as a `[FAIL]` row, which fails no job.

## Verification and Prevention

- Plant one fixture per environment branch, and observe it admitted before the fix and refused after. The refusal journey in `test-timings.test.ts` plants configs gated on `CI`, on `STRYKER_SHARD` being set, on it being empty, and on `GITHUB_OUTPUT`, and asserts the exact list of refusal titles.
- Run the journey with the job's variables set (`CI=true`) rather than an empty environment, so the gate is tested the way it runs.
- A pure test on `admitMutation` checks that a package refused differently under each shape reports both refusals, and that one refused identically under both reports once, naming both shapes.
- Code smell: an admission check that runs the subject under `clearEnv` or a hand-picked allowlist, or that sets one fixed value for a variable the run varies.

## Related

- [label-routed-rules-are-unfalsifiable.md](label-routed-rules-are-unfalsifiable.md): the same family of gate that cannot fail, keyed on a label instead of an environment.
- [constraint-reaches-only-via-window-or-gate.md](constraint-reaches-only-via-window-or-gate.md): a gate that loses its subject certifies nothing.
- [an-escape-hatch-is-an-unfalsified-hypothesis.md](an-escape-hatch-is-an-unfalsified-hypothesis.md): probe first, and grant nothing a probe defeats.
