---
title: The mutation planner pins what it copies from Stryker against Stryker's published surface
date: "2026-10-13"
category: tooling-decisions
module: systemfsoftware
problem_type: tooling_decision
component: tooling
severity: medium
applies_when:
  - Bumping @systemfsoftware/stryker-js or @systemfsoftware/stryker-js-cli-contract in pnpm-lock.yaml
  - Changing how the mutation probe finds a package's Stryker config
  - Changing how the mutation planner reads a `stryker plan --out` file
  - Replacing a hand-written stand-in for a vendor tool in a scripts test
root_cause: copied_vendor_behaviour_without_oracle
resolution_type: contract_test_against_installed_vendor
related_components:
  - scripts/tools/mutation-probe.mjs
  - scripts/tools/mutation-plan.ts
  - scripts/tools/mutation-probe.contract.test.ts
  - scripts/tools/stryker-reads.ts
  - scripts/tools/test-timings.test.ts
  - scripts/deno.jsonc
tags:
  - stryker
  - mutation
  - contract-test
  - vendor-pin
  - deno
---

# The mutation planner pins what it copies from Stryker against Stryker's published surface

## Problem

The Mutation plan (`test-timings plan --task mutation`) judges each package by what Stryker would do there, so it
carries two pieces of Stryker's behaviour: the config file names Stryker discovers, in its order (the probe's
`DISCOVERED` list in `mutation-probe.mjs`), and the shape of the plan file `stryker plan --full --out` writes
(`mutantCountOf` in `mutation-plan.ts`). Both were copies: the names rebuilt from the 17.0.2 source, the plan a
partial schema, and the sizing journey's fake `stryker` printed a hand-typed plan. Nothing compared either copy with
the Stryker the workspace installs, so a lockfile bump could change Stryker's behaviour while every test stayed green.

## Mechanism

1. **The list is private.** `DISCOVERABLE_CONFIG_FILE_NAMES` is module-private in the published bundle, so no test can
   import and compare it. What is exported is the reader: `Configuration.readConfig`, the call `stryker run` makes.
2. **The plan schema is published.** `@systemfsoftware/stryker-js-cli-contract` exports `ShardPlan`, and the CLI
   bundles the same definition and writes its plan with `fromJsonString(ShardPlan)`.
3. **A copy compared with itself certifies nothing.** A fake built from the same belief as the code under test agrees
   with it by construction (CONST-T10).

## Architectural Invariants

- **A copied vendor behaviour is compared with the vendor's own code, never with a second copy.** Where the vendor
  exports the behaviour, the code uses the export; where it exports only an entry that performs the behaviour, a
  contract test drives that entry and the copy over the same inputs and compares the outputs.
- **A stand-in writes through the vendor's contract.** The fake `stryker` encodes its plan with `ShardPlan`, so it
  cannot write a document the CLI's schema refuses. It does not reproduce the CLI's shard split, which the planner
  does not read; a planner that starts reading it needs a fake that splits the way the CLI does.

```text
order(dir, reader) = []                         -- read, remove what was read, repeat
  while (file = reader(dir)) != none: append file, remove file
assert order(candidates, probe) == order(candidates, Configuration.readConfig)
```

## Decision

- The planner decodes the plan file with the contract's `ShardPlan`; the hand copy is deleted, and the fake `stryker`
  encodes its plan with the same schema.
- The probe contract test runs `Configuration.readConfig` (through the `stryker-reads.ts` helper, in its own process,
  because loading Stryker needs `--allow-sys`) and the probe over two copies of a directory holding 216 candidate
  config file names: Stryker's prefixes, stems, suffixes and extensions, and neighbours of each (legacy JSON and
  CommonJS, other module extensions, case and separator spellings). The two read orders must be equal, so a name
  Stryker reads that the probe does not, or reads earlier, fails it.
- Three tests were deleted on 2026-10-13, at the owner's direction, each for its own reason:
  - the matcher table checked a function defined in the test file, so no planner change could move it (CONST-T3);
  - the lockfile version and patch tripwire checked that the import map's Stryker matched the lockfile's. That is a
    property of the test's oracle, not of the planner, so no planner change could move it either;
  - the recorded `stryker plan` literal could fail on a planner counting defect. It was dropped because it was a
    hand-kept copy of one past CLI output, presented as what the installed CLI writes. The plan count stays covered by
    the sizing and plan-failure journeys in `test-timings.test.ts`, whose plans the contract's `ShardPlan` encodes or
    refuses, with expected counts set by the test, not read from the planner (CONST-T10).

## Alternatives considered

1. **Run the real `stryker plan` CLI in the suite and compare its plan with the fake's.** Not done here. The CLI needs
   Node and an installed workspace (under Deno it stops at `nodeModule.enableCompileCache is not a function`), and the
   scripts suite runs in the checks plan lane, which installs nothing. It needs a new or changed CI lane, which is a
   new gate for the operator to approve (GATE1). Its first real run is a Mutation dispatch on `main`.
2. **Assert the probe's list equals Stryker's exported list.** Not possible: the list is not exported.
3. **Read the list out of the bundle's text.** Rejected: it parses a build artifact with no contract behind it, so a
   rename in the bundle breaks the test while Stryker's behaviour stays the same.
4. **Have the probe call `Configuration.readConfig` instead of copying the list.** Rejected for this change: it returns
   merged, validated options and not the file it read, while the probe judges the config's own `mutate` before Stryker
   merges defaults into it, and names that file in every refusal.

## Verification

- The order test: `deno test` over the scripts tools directory; Stryker's order today is the 16 names
  `{'', '.'} × stryker × {.conf, .config} × {ts, mts, js, mjs}`, prefix first, then suffix, then extension.
- The order test's oracle is the Stryker the scripts import map pins, not necessarily the one `pnpm-lock.yaml` resolves;
  nothing fails when the two diverge.

## Residual risk

- The order test runs Stryker's reader under Deno's Node compatibility, not under Node. Discovery is a sequence of
  existence checks, so the runtime is not expected to change the result.
- The order test checks the probe against the import map's Stryker, so after a lockfile bump it certifies a reader the
  workspace may no longer run, until the import map is bumped to match. A pnpm `patchedDependencies` or `overrides`
  entry for Stryker or its contract changes what the workspace installs under the same version, and nothing fails on
  that either. This leaves the upgrade-tripwire clause of the boundary-testing pack's pin-dependency-semantics rule
  unmet for this pin, as a recorded violation, until the comparison runs against the Stryker the workspace installs.
- Whether the CLI accepts the flags the planner passes (`plan --full --target-seconds <n> --out`) and writes a plan the
  planner counts is checked only by the fake; the first Mutation dispatch on `main` is the first real run.
