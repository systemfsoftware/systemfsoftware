---
title: The mutation planner pins what it copies from Stryker against Stryker's published surface
date: "2026-10-13"
last_updated: "2026-10-13"
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
  - packages/toolchain/stryker-config/tests/probe-discovery-order.test.ts
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
2. **The plan schema is published.** `@systemfsoftware/stryker-js-cli-contract` exports `ShardPlan`. The CLI does not
   depend on that package: it bundles its own copy of the definition and writes its plan with it.
3. **A copy compared with itself certifies nothing.** A fake built from the same belief as the code under test agrees
   with it by construction (CONST-T10).

## Architectural Invariants

- **A copied vendor behaviour is compared with the vendor's own code, never with a second copy.** Where the vendor
  exports the behaviour, the code uses the export; where it exports only an entry that performs the behaviour, a
  contract test drives that entry and the copy over the same inputs and compares the outputs.
- **A stand-in writes through the vendor's contract.** The fake `stryker` encodes its plan with `ShardPlan`, so it
  cannot write a document the CLI's schema refuses. It does not reproduce the CLI's shard split, which the planner
  does not read; a planner that starts reading it needs a fake that splits the way the CLI does.
- **A rejected test is deleted assertion by assertion.** Before deleting a rejected test, whatever the reason, list
  its assertions and name each one's subject: test apparatus, the test's own oracle, or product behaviour; an assertion
  with several subjects counts as product behaviour. A product-behaviour assertion moves to a test with an independent
  oracle, or its gap is written under Residual risk and named in the pull request, whose owner accepts or refuses it
  before merge (CONST-W1). The lockfile tripwire was deleted as an oracle check; its contract-version and patch
  assertions also guarded the planner's decode schema and the workspace install, which review found only after the
  deletion.
- **A cached tripwire is proven to re-run for each kind of upgrade.** A pin that a build cache replays fires only
  when the cache key moves, and turbo's key moves for a version but not for a pnpm patch. Perturb each upgrade kind
  (version, override, patch declaration, patch content) and confirm the task hash moves before relying on it.

```text
order(dir, reader) = []                         -- read, remove what was read, repeat
  while (file = reader(dir)) != none: append file, remove file
assert order(candidates, probe) == order(candidates, Configuration.readConfig)
```

## Decision

- The planner decodes the plan file with the contract's `ShardPlan`; the hand copy is deleted, and the fake `stryker`
  encodes its plan with the same schema.
- The discovery pin runs where the workspace is installed. The `@systemfsoftware/stryker-config` package's
  discovery-order test runs, under Node, the reader of the Stryker that package installs (`Configuration.readConfig`,
  resolved from its `node_modules`) and the probe over two copies of a directory holding
  216 candidate config file names: Stryker's prefixes, stems, suffixes and extensions, and neighbours of each (legacy
  JSON and CommonJS, other module extensions, case and separator spellings). The two read orders must be equal, so a
  name Stryker reads that the probe does not, or reads earlier, fails it. Two keys re-run it against what was
  installed. The package depends on `@systemfsoftware/stryker-js` through the `stryker` catalog, so turbo folds the
  Stryker version `pnpm-lock.yaml` resolves for it into `hashOfExternalDependencies`; that hash ignores a pnpm patch
  (it drops the `patch_hash` suffix and the lockfile's `patchedDependencies`), so the package's `turbo.json` adds
  `pnpm-workspace.yaml`, which declares patches and overrides, the `patches/` directory and the probe file to the
  task's inputs. This is the pack's upgrade tripwire with no copy kept in step: the oracle is the installed Stryker.
- Three tests were deleted on 2026-10-13, at the owner's direction, each for its own reason:
  - the matcher table checked only a name matcher defined in the test file; no product code is its subject;
  - the tripwire asserted that the import map's Stryker and contract versions equal the ones `pnpm-lock.yaml`
    resolves, and that no `pnpm-workspace.yaml` patch or override names either. The owner rejected it as a test kept
    to hold another test's oracle in step. Its Stryker and patch halves are replaced by the installed-Stryker pin
    above; its contract half has no replacement (see Residual risk);
  - the recorded `stryker plan` literal could fail on a planner counting defect. It was dropped because it was a
    hand-kept copy of one past CLI output, presented as what the installed CLI writes. The plan count stays covered by
    the sizing journey in `test-timings.test.ts`, whose fake writes plans encoded with the contract's `ShardPlan` and
    whose expected counts are its own literals; the plan-failure journey covers the refusal side of the same decode.

## Alternatives considered

1. **Run the real `stryker plan` CLI in a test and compare its plan with the fake's.** Not done here. An installed
   test lane could run it, but that is a Stryker run on a pull request, and Stryker runs only in the Mutation lane on
   `main` (REPO-D3). Its first real run is the first Mutation run on `main`: a dispatch today, the nightly once the
   lane carries its schedule.
2. **Assert the probe's list equals Stryker's exported list.** Not possible: the list is not exported.
3. **Read the list out of the bundle's text.** Rejected: it parses a build artifact with no contract behind it, so a
   rename in the bundle breaks the test while Stryker's behaviour stays the same.
4. **Have the probe call `Configuration.readConfig` instead of copying the list.** Open, not done here. It changes the
   probe, and with it the facts the Mutation plan's admission step (`admitMutation` in `mutation-plan.ts`) judges, so
   it is a probe change decided on its own evidence, not part of a test fix. The obstacle to settle first: `readConfig`
   returns merged, validated options and not the file it read, while the probe judges the config's own `mutate` before
   Stryker merges defaults into it, and carries the file it read in its facts, which admission names when it refuses a
   config's own mutate targets.

## Verification

- The discovery pin: `pnpm --filter @systemfsoftware/stryker-config test`. Stryker's order today is the 16 names
  `{'', '.'} × stryker × {.conf, .config} × {ts, mts, js, mjs}`, prefix first, then suffix, then extension.
- `turbo run test --filter=@systemfsoftware/stryker-config --dry=json`, with each change restored after: renaming the
  locked Stryker 17.0.2 to 17.0.3 moved `hashOfExternalDependencies`; a `patch_hash` suffix on its lockfile key, a
  lockfile `patchedDependencies` entry or a changed integrity moved nothing; a Stryker `patchedDependencies` entry in
  `pnpm-workspace.yaml`, or a new file under `patches/`, moved the task hash once those were inputs.

## Residual risk

- The probe and Stryker's reader run under the Node the test lane installs; the Mutation lane may run a different
  Node. Discovery is a sequence of existence checks, so the runtime is not expected to change the result.
- The contract pin has no re-firing test. The planner decodes `stryker plan --out` with the import map's
  `@systemfsoftware/stryker-js-cli-contract`, while the CLI that writes the file bundles its own copy of the schema.
  The only oracle for what the CLI writes is the CLI's output, which runs only in the Mutation lane on `main`; a
  version comparison against the lockfile is the tripwire the owner rejected. The plan job on `main` refuses a plan
  file the schema does not decode, or a CLI that exits non-zero, naming the package. This leaves the pack's
  upgrade-tripwire clause unmet for the contract pin; the owner's ruling on it is recorded in #767.
- Whether the CLI accepts the flags the planner passes (`plan --full --target-seconds <n> --out`) and writes a plan the
  planner counts is checked only by the fake; the first real run is the first Mutation run on `main` (a dispatch today,
  the nightly once the lane carries its schedule).
