# @systemfsoftware/effect-cell-types

The type-level contract for a `*.workflow.ts` cell. A workflow is a pure decision — a command in, an `Either` out — and `Workflow<Command, Decision, Error>` pins that shape in the type system. The contract is checked by `tsc` from the file's **content** (an exported value that violates the shape stops the build), not by a lint rule keyed on the file's **name**. The package is type-only: it emits no runtime values, and consumers use `import type`.

## The contract

```ts
import type { Workflow } from '@systemfsoftware/effect-cell-types'

type Decide = Workflow<Command, Decision, Error>
//          = (command: Command) => Either<Decision, Error>
```

When both channels are inhabited, `Workflow<Command, Decision, Error>` is exactly the function type `(command: Command) => Either<Decision, Error>`. A `never` channel does not silently collapse to that function: it resolves to a marker interface that no function can satisfy, so the mistake is a compile error with the remediation attached (below).

## Worked example

`decideRestart` in `@systemfsoftware/effect-daemon-spec` (`src/internal/restart-decision.workflow.ts`) is the real consumer — a supervisor deciding what to do when a child exits. The sibling schema file, which defines `DecideInput` and `RestartStrategy`, is elided here.

```ts
import type { Workflow } from '@systemfsoftware/effect-cell-types'
import { type Either, left, right } from 'effect/Either'
import * as Match from 'effect/Match'
import * as S from 'effect/Schema'

const RestartDecisionTypeId: unique symbol = Symbol.for(
  '@systemfsoftware/effect-daemon/RestartDecision',
)
type RestartDecisionTypeId = typeof RestartDecisionTypeId

export class RestartDecisionContinue extends S.TaggedClass<RestartDecisionContinue>()('Continue', {}) {
  readonly [RestartDecisionTypeId] = RestartDecisionTypeId
}

export class RestartDecisionRestart extends S.TaggedClass<RestartDecisionRestart>()('Restart', {
  indices: S.NonEmptyArray(S.Int),
}) {
  readonly [RestartDecisionTypeId] = RestartDecisionTypeId
}

export class RestartDecisionExhausted extends S.TaggedError<RestartDecisionExhausted>()('Exhausted', {}) {
  readonly [RestartDecisionTypeId] = RestartDecisionTypeId
}

export type RestartDecisionEither = Either<
  RestartDecisionContinue | RestartDecisionRestart,
  RestartDecisionExhausted
>

const restartIndicesFor = (
  strategy: RestartStrategy,
  failedIndex: number,
  total: number,
): readonly [number, ...ReadonlyArray<number>] =>
  Match.value(strategy).pipe(
    Match.when('one_for_one', () => [failedIndex] as const),
    Match.when(
      'one_for_all',
      () => [0, ...Array.from({ length: Math.max(0, total - 1) }, (_, i) => i + 1)] as const,
    ),
    Match.when(
      'rest_for_one',
      () =>
        [
          failedIndex,
          ...Array.from({ length: Math.max(0, total - failedIndex - 1) }, (_, i) => failedIndex + 1 + i),
        ] as const,
    ),
    Match.exhaustive,
  )

export const decideRestart: Workflow<
  DecideInput,
  RestartDecisionContinue | RestartDecisionRestart,
  RestartDecisionExhausted
> = (input: DecideInput): Either<
  RestartDecisionContinue | RestartDecisionRestart,
  RestartDecisionExhausted
> =>
  Match.value(input).pipe(
    Match.when({ exitSuccess: true }, () => right(new RestartDecisionContinue())),
    Match.when(
      { exitSuccess: false, intensityExceeded: true },
      () => left(new RestartDecisionExhausted()),
    ),
    Match.orElse(() =>
      right(
        new RestartDecisionRestart({
          indices: restartIndicesFor(input.strategy, input.failedIndex, input.totalChildren),
        }),
      )
    ),
  )
```

The shape to copy: one exported function annotated `Workflow<…>`, whose body returns `Either` values via `right` and `left`. The error channel is a real variant (`RestartDecisionExhausted`) — giving up is a decision the caller must branch on, so declaring the error channel `never` is rejected, not allowed.

## What it rejects at compile time

All four violations fail `tsc`; the messages below are what `tsc` reports (verified against this package and `effect@3.22.0`).

| Violation                | `tsc` reports                                                                             | Why it is rejected                                                                                             |
| ------------------------ | ----------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| A `Promise` return       | `Type 'Promise<Decision>' is not assignable to type 'Either<Decision, Err>'`              | a workflow is a synchronous pure decision; async work belongs in the executor shell around it                  |
| An `Effect` return       | `Type 'Effect<Decision, never, never>' is not assignable to type 'Either<Decision, Err>'` | the workflow returns a value, not an effect handle; the executor runs effects and hands the workflow its input |
| `never` decision channel | `Type '...' is not assignable to type 'UninhabitedDecision'`                              | a workflow that can never produce a decision can never succeed                                                 |
| `never` error channel    | `Type '...' is not assignable to type 'UninhabitedError'`                                 | a workflow that cannot fail decides nothing; move it to a `*.kernel.ts`                                        |

The two `never` cases are where the content-vs-filename distinction pays off. `Workflow<C, never, E>` resolves to `UninhabitedDecision` and `Workflow<C, D, never>` to `UninhabitedError` — interfaces whose only property is required and whose _type_ is the remediation, so the compile error points at the fix:

```ts
export interface UninhabitedDecision {
  readonly __WORKFLOW_DECISION_CHANNEL_IS_NEVER__:
    'this workflow can never succeed; give it a decision variant it can return'
}

export interface UninhabitedError {
  readonly __WORKFLOW_ERROR_CHANNEL_IS_NEVER__:
    'this workflow cannot fail, so it decides nothing; give it an error variant or move it to a *.kernel.ts'
}
```

The `never` checks use `[Decision] extends [never]`, not `Decision extends never`: the tuple wrap stops conditional-type distribution, without which `never` satisfies the conditional vacuously and the marker is never reached.

## Either.gen bodies work — and are checked more tightly

A `Workflow` body may be an `Either.gen` generator:

```ts
import type { Workflow } from '@systemfsoftware/effect-cell-types'
import { Either } from 'effect'

class Decision {}
class Err {
  constructor(readonly reason: string) {}
}
interface Input {
  readonly valid: boolean
}

const decide: Workflow<Input, Decision, Err> = (input) =>
  Either.gen(function*() {
    if (!input.valid) {
      yield* Either.left(new Err('invalid input'))
    }
    return new Decision()
  })
```

`Either.gen` infers its error channel from the union of the `Either`s the body yields, so the failing `yield*` above makes the inference exactly `Err` and the annotation holds. A body with **no** failing yield infers `unknown`, which does not satisfy a declared error type — so an unreachable error channel is rejected rather than silently allowed:

```ts
const decide: Workflow<Input, Decision, Err> = (input) =>
  Either.gen(function*() {
    return new Decision()
  })
// tsc: Type 'Either<Decision, unknown>' is not assignable to type 'Either<Decision, Err>'
```

If the workflow genuinely cannot fail, the error channel says so — and that is a `*.kernel.ts`, not a workflow.

## A wrong channel breaks the whole consumer cone

Measured on the real consumer: when `decideRestart`'s error channel was set to `never`, `tsc` produced errors in the workflow file, 11 in its property test, and 4 in a downstream executor (`supervisor-body.executor.ts`). A lint rule flags one file; a type breaks every consumer. The workflow file, its tests, and everything that calls it fail together, at compile time, before anything runs.

## Install

```bash
pnpm add -D @systemfsoftware/effect-cell-types
```

A devDependency — the package is type-only and `import type` is erased at runtime. `effect` is a peer dependency: bring your own (you already have it).
