# @systemfsoftware/effect-cell-types

The type-level contract for a `*.workflow.ts` cell. A workflow is a pure decision — a command in, a `Result` out — and `Workflow<Command, Decision, Error>` pins that shape in the type system. The contract is checked by `tsc` from the file's **content** (an exported value that violates the shape stops the build), not by a lint rule keyed on the file's **name**. Beside the types the package ships the Cell runtime — the `Sandwich` chain constructors, the arrow combinators, the constructors, and the Do chain — and the type tests (`test-types/Workflow.tst.ts`, run by tstyche) prove the channel guards still bind.

## The contract

```ts
import type { Workflow } from '@systemfsoftware/effect-cell-types'

type Decide = Workflow<Command, Decision, Error>
//          = ((command: Command) => Result<Decision, Error>) & WorkflowBrand
```

When both channels are inhabited, `Workflow<Command, Decision, Error>` is the function type
`(command: Command) => Result<Decision, Error>` carrying the nominal `WorkflowBrand`
conjunct — a phantom readonly TypeId-keyed field that no runtime property backs. The brand
is what makes the workbook nominal: `Workflow.make` is the only constructor that applies
it, and every surface that runs a decision — the chain's `decide` slot demands it —
requires it, so a decision that skipped `make` is a compile error at the call site that would have run it, with the brand named in the diagnostic. A `never` channel does
not silently collapse to that function: it resolves to a marker interface that no function
can satisfy, so the mistake is a compile error with the remediation attached (below). The
success channel is shaped the same way: `Workflow.make` refuses a decision channel that is
not a tagged union of at least two schema tagged classes sharing one TypeId — a single
outcome, an untagged variant, or variants with divergent family brands each resolve to a
marker interface whose property name is the remediation.

## The constructor

Executors build a workflow from the command's schema class and a decider over that class — runtime identity, one assertion across the branded return:

```ts
import { make, Workflow } from '@systemfsoftware/effect-cell-types'
import { Result } from 'effect'
import * as S from 'effect/Schema'

export class DecideInput extends S.Class<DecideInput>('DecideInput')({
  exitSuccess: S.Boolean,
}) {
  static readonly [Workflow.InstrumentationBrand] = { exitSuccess: 'app.restart.exit-success' } as const
}

export const decide = make(
  DecideInput,
  (input) => (input.exitSuccess
    ? Result.succeed(new RestartDecisionContinue())
    : Result.fail(new RestartDecisionExhausted())),
)
```

The command is constrained on the **value**, not on a type parameter inferred from the decider's parameter, and that is the whole mechanism. A constraint on such a parameter is a structural predicate, and TypeScript cannot express "this type came from a class declaration" — so a marker placed there is just a property, and `interface Fake extends Marker {}` satisfies it. A declared type produces no value, so it cannot reach an argument position at all: an interface at the command position is refused with "only refers to a type, but is being used as a value here". `Schema.Class` and `Schema.TaggedClass` are both accepted; a `Schema.Struct`, a plain class, an object literal and a primitive are each refused.

No type argument needs writing: the command type comes from the class, so the decider's parameter needs no annotation. The `never`-channel conditional still lives on the **return** type, so a total decision (`Result<Decision, never>`) resolves to `UninhabitedError` and the call site fails with "This expression is not callable", while a `Promise`- or bare-value-returning decider is rejected at the argument. `make` is a runtime value, so consumers need it as an ordinary import only where they construct workflows; everywhere else `import type` still erases at compile time.

## Worked example

`decideRestart` in `@systemfsoftware/effect-daemon-spec` (`src/internal/restart-decision.workflow.ts`) is the real consumer — a supervisor deciding what to do when a child exits. The sibling schema file, which defines `DecideInput` and `RestartStrategy`, is elided here.

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

export const decideRestart = Workflow.make(
  DecideInput,
  (input): Result.Result<
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
)
```

The shape to copy: one exported decision built by `Workflow.make`, taking the command's
schema class and a decider over that class, whose body returns `Result` values via
`Result.succeed` and `Result.fail`. The command channel comes from the class, the decision
and error channels are inferred from the annotated return, and `make` is the only door to
the `WorkflowBrand` conjunct — annotating a function `Workflow<…>` directly is still refused
wherever the brand is demanded, because a workflow that never passed through `make` is not a
decision anything may run. The error channel is a real variant (`RestartDecisionExhausted`) —
giving up is a decision the caller must branch on, so declaring the error channel `never` is
rejected, not allowed.

## Building a cell: the `Sandwich` chain

A cell is authored as a typed continuation chain, not a record of phases. `Sandwich.named` takes a static operation name and returns a reader accepting the impure read effect, which returns only the lawful next steps; each step composes its `run` at construction and exposes only what may follow, so a misordered chain fails to compile with a missing-method error whose displayed type names the lawful next steps. There is no interpreter: composition happens step by step inside the constructors. Every finished cell carries a recorded `phases` tuple — a type-level literal plus a matching runtime array, both produced by the constructors.

| Step     | Exposes next                                    | Channel law                                                      |
| -------- | ----------------------------------------------- | ---------------------------------------------------------------- |
| `named`  | `decode`, `decide`                              | `I` consumed; `Raw` produced; `E`/`R` from the `Effect`          |
| `decode` | `decide`                                        | a `Sandwich.pure` phase; its refusal fails the cell              |
| `decide` | `encode` (decoded chain) or `write` (raw chain) | a `Workflow.make` value; the outcome is a value, never a failure |
| `encode` | `write`                                         | a `Sandwich.pure` phase shaping the outcome `Result`             |
| `write`  | —                                               | `Out` plus `Raw` in (or unary `Out` alone); `Resp`/`E`/`R` out   |

A short chain skips the filling's middle steps — `read → decide → write` — and records exactly those three phases:

```ts
import { Sandwich, type Workflow } from '@systemfsoftware/effect-cell-types'
import { Effect, Result } from 'effect'

// The reader's own domain: a command, its raw reading, and a decide outcome.
interface Command {
  readonly id: string
}
interface Raw {
  readonly bytes: string
}

// `admit` is a `Workflow.make` value over the decoded form, built as in
// "The constructor" above; `render` turns its outcome into a string.
declare const admit: Workflow<Decoded, Admitted, Malformed>
declare const render: (outcome: Result.Result<Admitted, Malformed>) => string

const cell = Sandwich.named('command.admit')((command: Command) =>
  Effect.succeed(new Decoded({ length: command.id.length }))
).decide(
  admit,
).write(
  (outcome: Result.Result<Admitted, Malformed>) => Effect.sync(() => render(outcome)),
)

cell.phases // ['read', 'decide', 'write']
```

A full chain fills `decode` and `encode` with `Sandwich.pure` phases — synchronous `Result`-returning thunks, the only values the slots accept, so no `Effect` can be evaluated inside them:

```ts
const full = Sandwich.named('command.admit')((command: Command) => Effect.succeed({ bytes: command.id })).decode(
  Sandwich.pure((raw: Raw): Result.Result<Decoded, Malformed> =>
    Result.succeed(new Decoded({ length: raw.bytes.length }))
  ),
).decide(admit).encode(
  Sandwich.pure((outcome: Result.Result<Admitted, Malformed>): Result.Result<string, never> =>
    Result.succeed(render(outcome))
  ),
).write((line: string, raw: Raw) => Effect.succeed(`${line}<-${raw.bytes}`))

full.phases // ['read', 'decode', 'decide', 'encode', 'write']
```

The `decide` refusal is an outcome, not a failure: it travels to `encode` and `write` as a `Result` value. A `decode` refusal fails the cell and the run stops there.

### Operation names and telemetry

The operation name passed to `Sandwich.named` is a static string literal that identifies the cell. It names the parent span and sets the duration histogram name (`app.<name>.duration`, recording seconds with the single label `result_class`). Child spans are `<name>.read` and `<name>.write`. The attributes copied onto the parent span come from the command schema class's static `InstrumentationBrand` map: each entry names a schema field and the OpenTelemetry attribute key the field's value is copied as (`{ orderId: 'app.order.id' }`), a key must be lowercase and dot-separated, and each mapped field must hold a string, number, or boolean — a field holding an object is copied as a raw object, which OTLP backends reject. The run's outcome rides `app.<operation>.decision` or `app.<operation>.failure`, valued by the outcome variant's tag. `Workflow.SpanAttributes<typeof Command>` derives the declared attribute record from the map, so a span declaration pins its `attrs` schema against the command's own instrumentation. `Sandwich.named(name)` uses `Sandwich.DEFAULT_DURATION_BOUNDARIES`; passing an options object (`Sandwich.named(name, { boundaries })`) overrides the duration histogram buckets. The buckets belong to the name: two cells that share an operation name share one histogram, and the boundaries declared first for that name are the ones that count.

```ts
const cell = Sandwich.named('order.submit', {
  boundaries: [0.01, 0.05, 0.1, 0.5, 1, 5],
})((command: SubmitOrderCommand) => readOrderEffect(command))
  .decide(decideOrder)
  .write((outcome) => writeOrderEffect(outcome))
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

The vocabulary falls into four groups. The eight sandwich arrows (`map`, `mapInput`, `andThen`, `zip`, `gate`, `collect`, `collectAll`, `provide`) thread cells built by the chain. The error-channel arrows (`mapError`, `orElse`, `tap`) and the sequencing arrows (`flatMap`, `zipWith`, the `andThen` function overload, `match`) extend the same algebra over the run outcome. The constructors (`succeed`, `fail`, `fromEffect`, `suspend`, `id`) are category units: they carry a constant, a constant failure, a lifted effect, a deferred thunk, or the identity — input-agnostic values with no phases to sequence, so they never bypass the sandwich requirement for pipelines. The Do chain (`Do`, `bind`, `bindTo`, `let`) composes cells as do-notation over the accumulated record.

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

All six violations fail `tsc`; the messages below are what `tsc` reports (verified against this package and `effect@4.0.0-rc.108`).

| Violation                                 | `tsc` reports                                                                             | Why it is rejected                                                                                                        |
| ----------------------------------------- | ----------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| A `Promise` return                        | `Type 'Promise<Decision>' is not assignable to type 'Result<Decision, Err>'`              | a workflow is a synchronous pure decision; async work belongs in the executor shell around it                             |
| An `Effect` return                        | `Type 'Effect<Decision, never, never>' is not assignable to type 'Result<Decision, Err>'` | the workflow returns a value, not an effect handle; the executor runs effects and hands the workflow its input            |
| `never` decision channel                  | `Type '...' is not assignable to type 'UninhabitedDecision'`                              | a workflow that can never produce a decision can never succeed                                                            |
| `never` error channel                     | `Type '...' is not assignable to type 'UninhabitedError'`                                 | a workflow that cannot fail decides nothing; fold the function into its owning module                                     |
| An untagged error variant                 | `Type '...' is not assignable to type 'UntaggedError'`                                    | an error variant needs a `_tag` a consumer can dispatch on; declare the errors as `S.TaggedError` instances               |
| A single-variant decision channel         | `Type '...' is not assignable to type 'SingleVariantDecision'`                            | a decision chooses between at least two distinguishable outcomes; one variant is a calculation wearing a decision's shape |
| An untagged decision variant              | `Type '...' is not assignable to type 'UntaggedDecision'`                                 | a decision variant needs a `_tag` a consumer can dispatch on; declare the variants as `S.TaggedClass` instances           |
| Decision variants with no shared TypeId   | `Type '...' is not assignable to type 'UnsharedTypeId'`                                   | one decision family carries one TypeId — a `Symbol.for` brand on every variant class                                      |
| A bare decider in a `decide` slot         | `Type '(command: Cmd) => Result<Dec, Err>' is not assignable to type 'WorkflowBrand'`     | only a `Workflow.make` value satisfies the `decide` slot; a lambda that skipped `make` is not a decision a chain may run  |
| A plain interface at the command position | `'Cmd' only refers to a type, but is being used as a value here`                          | the command is constrained on the value, and a declared type produces none — so there is no marker to smuggle             |

The two `never` cases are where the content-vs-filename distinction pays off. `Workflow<C, never, E>` resolves to `UninhabitedDecision` and `Workflow<C, D, never>` to `UninhabitedError` — interfaces whose only property is required and whose _type_ is the remediation, so the compile error points at the fix:

```ts
export interface UninhabitedDecision {
  readonly __WORKFLOW_DECISION_CHANNEL_IS_NEVER__:
    'this workflow can never succeed; give it a decision variant it can return'
}

export interface UninhabitedError {
  readonly __WORKFLOW_ERROR_CHANNEL_IS_NEVER__:
    'this workflow cannot fail, so it decides nothing; give it an error variant or fold the function into its owning module'
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

class Decision {}
class Err {
  constructor(readonly reason: string) {}
}
class Input extends S.Class<Input>('Input')({ valid: S.Boolean }) {
  static readonly [Workflow.InstrumentationBrand] = { valid: 'app.input.valid' } as const
}

const decide = Workflow.make(
  Input,
  (input): Result.Result<Decision, Err> =>
    Result.gen(function*() {
      const outcome = Match.value(input).pipe(
        Match.when({ valid: false }, () => Result.fail(new Err('invalid input'))),
        Match.orElse(() => Result.succeed(new Decision())),
      )
      return yield* outcome
    }),
)
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
const decide = Workflow.make(
  Input,
  (input): Result.Result<Decision, Err> =>
    Result.gen(function*() {
      return new Decision()
    }),
)
// tsc: Type 'Result<Decision, unknown>' is not assignable to type 'Result<Decision, Err>'
```

If the workflow genuinely cannot fail, the error channel says so — and that is a plain function inside its owning module, not a workflow.

## A wrong channel breaks the whole consumer cone

Measured on the real consumer: when `decideRestart`'s error channel was set to `never`, `tsc` produced errors in the workflow file, 11 in its property test, and 4 in a downstream executor (`supervisor-body.executor.ts`). A lint rule flags one file; a type breaks every consumer. The workflow file, its tests, and everything that calls it fail together, at compile time, before anything runs.

## Install

```bash
pnpm add -D @systemfsoftware/effect-cell-types
```

A devDependency — consumers mostly use the types (`import type`); the runtime surface is the Cell module (`Sandwich` chain, arrows, constructors, Do chain) plus the identity constructor `make`. `effect` is a peer dependency: bring your own (you already have it).
