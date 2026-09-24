# @systemfsoftware/differential-spec

Differential and metamorphic testing for [Effect](https://effect.website) programs: prove two implementations agree, or that one system obeys a relation across transformed inputs, without hardcoding an expected value. Failures shrink to the minimal counterexample and report both sides' outputs plus a reproduction snippet.

## Install

```bash
pnpm add @systemfsoftware/differential-spec
```

## Differential checks

Run a reference and a candidate on the same generated inputs and accept only when a relational oracle holds — or when both sides fail identically:

```ts
import { Differential } from '@systemfsoftware/differential-spec'
import { Effect } from 'effect'
import * as fc from 'fast-check'

Differential.compare({
  name: 'doubling by multiplication matches doubling by addition',
  reference: (x: number) => Effect.succeed(x * 2),
  candidate: (x: number) => Effect.succeed(x + x),
})
  .on(fc.integer())
  .assert((doubled, added) => doubled === added)
```

## Metamorphic checks

Check one system against itself: the relation must hold between the output on a seed input and the output on a transformed follow-up:

```ts
import { Metamorphic } from '@systemfsoftware/differential-spec'
import { Effect } from 'effect'
import * as fc from 'fast-check'

const keepPositives = (xs: number[]) => Effect.succeed(xs.filter((x) => x > 0))

Metamorphic.on({ name: 'keeping positives keeps one entry per positive amount', system: keepPositives })
  .relation({
    transformInput: (xs) => xs.map((x) => x * 2),
    assertOutput: (baseline, followUp) => followUp.length === baseline.length,
  })
  .on(fc.array(fc.integer(), { maxLength: 20 }))
```

## Options

Both builders take `.on(arbitrary, options)` with:

| Option      | Meaning                                           |
| ----------- | ------------------------------------------------- |
| `runBudget` | Number of generated inputs to run (default `100`) |

A check has no wall-clock limit. Each generated input runs on the simulation kernel, which bounds every run in steps.

## Notes

- Every comparison runs both sides on the simulation kernel under explored schedules, and a failure report names the schedule that produced it. `name` becomes the test's name.
- Targets are plain `Effect` values and may be asynchronous: `Effect.sleep` advances virtual time, and a promise that settles without host I/O resolves inside the run. A target that waits on a real timer, file, or socket fails the comparison with a report naming the wait.
- Checks register through `@effect/vitest`, so run them under Vitest; each `.assert` / `.relation` call adds one test to the suite.
- One side crashing is a discrepancy, not an abort: agreeing refusals (same failure fingerprint) still pass.
