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

Metamorphic.on(keepPositives)
  .relation({
    transformInput: (xs) => xs.map((x) => x * 2),
    assertOutput: (baseline, followUp) => followUp.length === baseline.length,
  })
  .on(fc.array(fc.integer(), { maxLength: 20 }))
```

## Options

Both builders take `.on(arbitrary, options)` with:

| Option                    | Meaning                                                                                                       |
| ------------------------- | ------------------------------------------------------------------------------------------------------------- |
| `runBudget`               | Number of generated inputs to run (default `100`)                                                             |
| `interruptAfterTimeLimit` | Wall-clock budget in milliseconds; an interrupted run is reported as inconclusive instead of passing silently |

## Notes

- Targets are plain `Effect` values and may be asynchronous — `Effect.sleep`, `Effect.promise`, or any deferred Effect.
- Checks register through `@effect/vitest`, so run them under Vitest; each `.assert` / `.relation` call adds one test to the suite.
- One side crashing is a discrepancy, not an abort: agreeing refusals (same failure fingerprint) still pass.
