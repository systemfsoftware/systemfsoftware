# @systemfsoftware/effect-cell-types

The type-level contract for a `*.workflow.ts` cell. A workflow is a pure decision — a command in, a `Result` out — and `Workflow<Command, Decision, Error>` pins that shape in the type system. The contract is checked by `tsc` from the file's **content** (an exported value that violates the shape stops the build), not by a lint rule keyed on the file's **name**. Beside the types the package ships the Cell runtime — the `Sandwich` chain constructors, the arrow combinators, the constructors, and the Do chain — and the type tests (`test-types/Workflow.tst.ts`, run by tstyche) prove the channel guards still bind.

## The contract

```ts
import type { Workflow } from '@systemfsoftware/effect-cell-types'

type Decide = Workflow<Command, Decision, Error>
//          = ((command: Command) => Result<Decision, Error>) & WorkflowBrand
```

When both channels are inhabited (or when error is `Schema.Never` and decision has at least two variants), `Workflow<Command, Decision, Error>` is the function type
`(command: Command) => Result<Decision, Error>` carrying the nominal `WorkflowBrand`
conjunct — a phantom readonly TypeId-keyed field that no runtime property backs. The brand
is what makes the workflow nominal: `Workflow.make` is the only constructor that applies
it, and every surface that runs a decision — the chain's `decide` slot demands it —
requires it, so a decision that skipped `make` is a compile error at the call site that would have run it, with the brand named in the diagnostic. A `never` decision channel
resolves to `UninhabitedDecision` that no function can satisfy.

The success channel is shaped the same way: `Workflow.make` accepts an exclusive tagged union (at least two outcomes across success and error together; a single success variant is allowed when the error channel is inhabited) or an array of tagged event variants, all sharing one TypeId — an untagged variant, unshared family brands, or a bare `boolean` each resolve to a marker interface whose property name is the remediation.

## The constructor

Executors build a workflow from options declaring the command, decision, and error schemas plus the decider:

```ts
import { Workflow } from '@systemfsoftware/effect-cell-types'
import { Result } from 'effect'
import * as S from 'effect/Schema'

export class DecideInput extends S.Class<DecideInput>('DecideInput')({
  exitSuccess: S.Boolean,
}) {
  static readonly [Workflow.InstrumentationBrand] = ['exitSuccess'] as const
}

export const decide = Workflow.make({
  command: DecideInput,
  decision: RestartDecision,
  error: S.Never,
  decide: (input) => (input.exitSuccess
    ? Result.succeed(new RestartDecisionContinue())
    : Result.succeed(new RestartDecisionRestart())),
})
```

The command is constrained on the schema **value**, not on an unconstrained type parameter, and that is the whole mechanism. `Schema.Class` and `Schema.TaggedClass` are both accepted; a plain class, an object literal, and a primitive are each refused.

The decider's parameter receives the command schema's `Type`. The decision and error channels are declared as schemas, and for a workflow that cannot fail, declaring `error: S.Never` is standard. `make` is a runtime value, so consumers need it as an ordinary import only where they construct workflows; everywhere else `import type` still erases at compile time.

## Worked example

`chooseRestartStrategy` in `@systemfsoftware/effect-daemon-spec` (`src/internal/choose-restart-strategy.workflow.ts`) is the real consumer — a supervisor deciding what to do when a child exits. It is shown here as `decideRestart`; the schema file that defines `DecideInput` and `RestartStrategy` is elided.

```ts
import { Workflow } from '@systemfsoftware/effect-cell-types'
import { Result } from 'effect'
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

const restartIndicesFor = (
  strategy: RestartStrategy,
  failedIndex: number,
  total: number,
): readonly [number, ...readonly number[]] =>
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

export const decideRestart = Workflow.make({
  command: DecideInput,
  decision: S.Union([RestartDecisionContinue, RestartDecisionRestart]),
  error: RestartDecisionExhausted,
  decide: (input): Result.Result<
    RestartDecisionContinue | RestartDecisionRestart,
    RestartDecisionExhausted
  > =>
    Match.value(input).pipe(
      Match.when({ exitSuccess: true }, () => Result.succeed(new RestartDecisionContinue())),
      Match.when(
        { exitSuccess: false, intensityExceeded: true },
        () => Result.fail(new RestartDecisionExhausted()),
      ),
      Match.orElse(() =>
        Result.succeed(
          new RestartDecisionRestart({
            indices: restartIndicesFor(input.strategy, input.failedIndex, input.totalChildren),
          }),
        )
      ),
    ),
})
```

The shape to copy: one exported decision built by `Workflow.make({ command, decision, error, decide })`. The command channel comes from the command schema class, the decision and error channels are derived from their declared schemas, and `make` is the only door to the `WorkflowBrand` conjunct.

## Building a cell: the `Sandwich` chain

A cell is authored as a typed continuation chain: `Sandwich.named(name, options?)(read).decide(workflow).write(handlers)`. `Sandwich.named` takes a static operation name and returns a reader accepting the impure read effect, which returns the command's `Encoded` type. `.decide(workflow)` takes the workflow; the library automatically derives the `decode` phase using the workflow's `command` schema, and the `encode` phase using the workflow's `decision` and `error` schemas. `.write(handlers)` takes a handler record keyed by every encoded decision tag, every encoded error tag, and `CommandRejected`. Handlers receive `(encodedValue, encodedCommand)`.

Every finished cell carries a recorded `phases` tuple: `readonly ['read', 'decode', 'decide', 'encode', 'write']`.

| Step     | Exposes next | Channel law                                                                                         |
| -------- | ------------ | --------------------------------------------------------------------------------------------------- |
| `named`  | `decide`     | `I` consumed; command `Encoded` produced; `E`/`R` from the `Effect`                                 |
| `decide` | `write`      | a `Workflow.make` value; library decodes command and encodes decision/error outcomes                |
| `write`  | —            | exhaustive handler record over decision tags, error tags, and `CommandRejected`; `Resp`/`E`/`R` out |

```ts
import { Sandwich, type Workflow } from '@systemfsoftware/effect-cell-types'
import { Effect, Result } from 'effect'

const cell = Sandwich.named('command.admit')((command: Command) => Effect.succeed({ id: command.id })).decide(
  admitWorkflow,
).write({
  Admitted: (admitted, raw) => Effect.succeed(`admitted:${admitted.id}`),
  Malformed: (refusal, raw) => Effect.succeed(`refused:${refusal.reason}`),
  CommandRejected: (rejected, raw) => Effect.fail(new InvalidInputError({ issue: rejected.issue })),
})

cell.phases // ['read', 'decode', 'decide', 'encode', 'write']
```

The `decide` refusal is encoded and passed to its error handler as an outcome. A decode failure reaches the `CommandRejected` handler with telemetry result class `failure`.

### Operation names and telemetry

The operation name passed to `Sandwich.named` is a static string literal that identifies the cell. It names the parent span and sets the duration histogram name (`app.<name>.duration`, recording seconds with the single label `result_class`). Child spans are `<name>.read` and `<name>.write`. The attributes copied onto the parent span are the command fields named by the command schema class's static `InstrumentationBrand` list, and each named field must hold a string, number, or boolean: a field holding an object is copied as a raw object, which OTLP backends reject. `Sandwich.named(name)` uses `Sandwich.DEFAULT_DURATION_BOUNDARIES`; passing an options object (`Sandwich.named(name, { boundaries })`) overrides the duration histogram buckets. The buckets belong to the name: two cells that share an operation name share one histogram, and the boundaries declared first for that name are the ones that count.

```ts
const cell = Sandwich.named('order.submit', {
  boundaries: [0.01, 0.05, 0.1, 0.5, 1, 5],
})((command: SubmitOrderCommand) => readOrderEffect(command))
  .decide(decideOrder)
  .write({
    OrderAccepted: (accepted, raw) => writeOrderEffect(accepted, raw),
    OrderRejected: (rejected, raw) => writeRefusalEffect(rejected, raw),
    CommandRejected: (rejected, raw) => Effect.fail(rejected),
  })
```

## Composing cells: arrows, constructors, and the Do chain

Every cell value is pipeable, so the module duals compose through the instance method as well as directly:

```ts
import { Cell, Sandwich } from '@systemfsoftware/effect-cell-types'
import { Effect, pipe } from 'effect'

declare const base: Cell.Cell<Command, string, Malformed>

const loud = pipe(base, Cell.map((line) => line.length), Cell.tap((n) => Effect.log(`length ${n}`)))
const same = base.pipe(Cell.map((line) => line.length), Cell.tap((n) => Effect.log(`length ${n}`)))
```

The vocabulary falls into four groups. The eight sandwich arrows (`map`, `mapInput`, `andThen`, `zip`, `gate`, `collect`, `collectAll`, `provideContext`) thread cells built by the chain. The error-channel arrows (`mapError`, `orElse`, `tap`) and the sequencing arrows (`flatMap`, `zipWith`, the `andThen` function overload, `match`) extend the same algebra over the run outcome. The constructors (`succeed`, `fail`, `fromEffect`, `suspend`, `id`) are category units: they carry a constant, a constant failure, a lifted effect, a deferred thunk, or the identity — input-agnostic values with no phases to sequence, so they never bypass the sandwich requirement for pipelines. The Do chain (`Do`, `bind`, `bindTo`, `let`) composes cells as do-notation over the accumulated record.

The register split: the shell writes imperative `Effect.gen`, the pure decide core stays pipeable, and the Cell composes as a Do chain:

```ts
const program = pipe(
  Cell.Do,
  Cell.bind('admitted', () => admitCell),
  Cell.bind('line', ({ admitted }) => renderCell(admitted)),
  Cell.let('shouted', ({ line }) => line.toUpperCase()),
)
```

Two composition laws share the module, and the export doc comments state which is which. `flatMap` threads the response value with the input channel fixed: the function returns a cell over the same input, run on the original one. `andThen` is arrow composition: the response becomes the next cell's input, and the function overload selects that next cell from the response value. `id` is the both-sided identity for `andThen`.

Recovery sees only the infrastructure `E` channel. `orElse`'s fallback runs on an `Effect` failure over the same input; a decide refusal is an outcome inside the sandwich — a success-channel value by the time `run` answers — so it passes through `mapError`, `orElse`, and `tap` untouched and the fallback never runs. `match` folds the same outcome: the success arm over `A`, the failure arm over `E`, yielding a cell whose error channel is `never`. Refusals therefore always reach `match`'s success arm, never its failure arm.

## What it rejects at compile time

All violations fail `tsc`; the messages below are what `tsc` reports (verified against this package and `effect@4.0.0-rc.108`).

| Violation                               | `tsc` reports                                                                             | Why it is rejected                                                                                                        |
| --------------------------------------- | ----------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| A `Promise` return                      | `Type 'Promise<Decision>' is not assignable to type 'Result<Decision, Err>'`              | a workflow is a synchronous pure decision; async work belongs in the executor shell around it                             |
| An `Effect` return                      | `Type 'Effect<Decision, never, never>' is not assignable to type 'Result<Decision, Err>'` | the workflow returns a value, not an effect handle; the executor runs effects and hands the workflow its input            |
| `never` decision channel                | `Type '...' is not assignable to type 'UninhabitedDecision'`                              | a workflow that can never produce a decision can never succeed                                                            |
| An untagged error variant               | `Type '...' is not assignable to type 'UntaggedError'`                                    | an error variant needs a `_tag` a consumer can dispatch on; declare the errors as `S.TaggedError` instances               |
| A single-variant decision channel       | `Type '...' is not assignable to type 'SingleVariantDecision'`                            | a decision chooses between at least two distinguishable outcomes; one variant is a calculation wearing a decision's shape |
| An untagged decision variant            | `Type '...' is not assignable to type 'UntaggedDecision'`                                 | a decision variant needs a `_tag` a consumer can dispatch on; declare the variants as `S.TaggedClass` instances           |
| Decision variants with no shared TypeId | `Type '...' is not assignable to type 'UnsharedTypeId'`                                   | one decision family carries one TypeId — a `Symbol.for` brand on every variant class                                      |
| A bare decider in a `decide` slot       | `Type '(command: Cmd) => Result<Dec, Err>' is not assignable to type 'WorkflowBrand'`     | only a `Workflow.make` value satisfies the `decide` slot; a lambda that skipped `make` is not a decision a chain may run  |

The `never` decision case is where the content-vs-filename distinction pays off. `Workflow<C, never, E>` resolves to `UninhabitedDecision` — an interface whose only property is required and whose _type_ is the remediation, so the compile error points at the fix:

```ts
export interface UninhabitedDecision {
  readonly __WORKFLOW_DECISION_CHANNEL_IS_NEVER__:
    'this workflow can never succeed; give it a decision variant it can return'
}

export interface UntaggedError {
  readonly __WORKFLOW_ERROR_CHANNEL_CARRIES_NO_TAG__:
    'this error carries no _tag the consumer can dispatch on; declare it as an S.TaggedError'
}

export interface SingleVariantDecision {
  readonly __WORKFLOW_DECISION_CHANNEL_HAS_ONE_VARIANT__:
    'this workflow decides one outcome, which is not a decision; add the variant it chooses between, or fold the function into its owning module'
}

export interface UntaggedDecision {
  readonly __WORKFLOW_DECISION_CHANNEL_CARRIES_NO_TAG__:
    'a decision variant carries no _tag the consumer can dispatch on; declare the variants as S.TaggedClass instances'
}

export interface UnsharedTypeId {
  readonly __WORKFLOW_DECISION_VARIANTS_DO_NOT_SHARE_A_TYPE_ID__:
    'the decision variants must share one TypeId — a Symbol.for family brand on each variant class'
}
```

The `never` checks use `[Decision] extends [never]`, not `Decision extends never`: the tuple wrap stops conditional-type distribution, without which `never` satisfies the conditional vacuously and the marker is never reached.

## Result.gen bodies work — and are checked more tightly

A `Workflow.make` body may be a `Result.gen` generator, so long as it stays one path:
the failing outcome rides an arm of an exhaustive dispatch, and the generator yields
the outcome once:

```ts
import { Workflow } from '@systemfsoftware/effect-cell-types'
import { Result } from 'effect'
import * as Match from 'effect/Match'
import * as S from 'effect/Schema'

class Decision extends S.TaggedClass<Decision>()('Decision', {}) {}
class Err extends S.TaggedError<Err>()('Err', { reason: S.String }) {}
class Input extends S.Class<Input>('Input')({ valid: S.Boolean }) {
  static readonly [Workflow.InstrumentationBrand] = ['valid'] as const
}

const decide = Workflow.make({
  command: Input,
  decision: Decision,
  error: Err,
  decide: (input): Result.Result<Decision, Err> =>
    Result.gen(function*() {
      const outcome = Match.value(input).pipe(
        Match.when({ valid: false }, () => Result.fail(new Err({ reason: 'invalid input' }))),
        Match.orElse(() => Result.succeed(new Decision())),
      )
      return yield* outcome
    }),
})
```

A conditional `yield*` — an `if` or ternary that places a failing `yield*` on one path —
opens a second path inside the decision and is refused by the `make-body-purity` lint
rule; the failure must live on one path of the dispatch (or a first-statement guard that
converges immediately), never behind a mid-body branch.

`Result.gen` infers its error channel from the union of the `Result`s the body yields,
so the failing arm above makes the inference exactly `Err` and the declaration holds. A
body with **no** failing yield infers `unknown`, which does not satisfy a declared error
type — so an unreachable error channel is rejected rather than silently allowed:

```ts
const decide = Workflow.make({
  command: Input,
  decision: Decision,
  error: Err,
  decide: (input): Result.Result<Decision, Err> =>
    Result.gen(function*() {
      return new Decision()
    }),
})
// tsc: Type 'Result<Decision, unknown>' is not assignable to type 'Result<Decision, Err>'
```

For workflows that cannot fail, declare `error: S.Never`.

## Install

```bash
pnpm add -D @systemfsoftware/effect-cell-types
```

A devDependency — consumers mostly use the types (`import type`); the runtime surface is the Cell module (`Sandwich` chain, arrows, constructors, Do chain) plus the identity constructor `make`. `effect` is a peer dependency: bring your own (you already have it).
