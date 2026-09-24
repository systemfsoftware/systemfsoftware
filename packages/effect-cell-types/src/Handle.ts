import * as Arr from 'effect/Array'
import * as Cause from 'effect/Cause'
import * as Context from 'effect/Context'
import * as Effect from 'effect/Effect'
import * as Exit from 'effect/Exit'
import { dual } from 'effect/Function'
import * as Layer from 'effect/Layer'
import type { Pipeable } from 'effect/Pipeable'
import { Prototype } from 'effect/Pipeable'
import * as Predicate from 'effect/Predicate'
import * as Ref from 'effect/Ref'
import type * as Scope from 'effect/Scope'
import * as Stream from 'effect/Stream'

import { HandleReleased } from './HandleReleased.schema.js'

export { HandleReleased } from './HandleReleased.schema.js'

type Top<A = unknown> = A

export const HandleTypeId: unique symbol = Symbol.for('@systemfsoftware/effect-cell-types/Handle')
export type HandleTypeId = typeof HandleTypeId

export const DefinitionTypeId: unique symbol = Symbol.for('@systemfsoftware/effect-cell-types/Handle/Definition')
export type DefinitionTypeId = typeof DefinitionTypeId

const Slot: unique symbol = Symbol('@systemfsoftware/effect-cell-types/Handle/driver')
const Mint: unique symbol = Symbol('@systemfsoftware/effect-cell-types/Handle/mint')

/**
 * The brand a definition mints onto every handle it acquires. Two handles carry the same brand
 * only when the same definition acquired them.
 */
export interface Brand<Name extends string> {
  readonly name: Name
}

export interface HandleOf<Name extends string> extends Pipeable {
  readonly [HandleTypeId]: Brand<Name>
}

/**
 * A live instance: the data its definition's `create` produced, branded by that definition and
 * pipeable. The driver never appears on the value's type; only the definition's own operations
 * receive it.
 */
export type Handle<Name extends string, Data> = Data & HandleOf<Name>

/** What a `create` or a child creator yields: the driver and the handle's data. */
export interface Acquired<D, Data> {
  readonly driver: D
  readonly data: Data
}

export interface Witness<D, Data> {
  readonly driver: D
  readonly data: Data
}

export interface DefinitionBrand<Name extends string, D, Data> {
  readonly name: Name
  readonly witness?: Witness<D, Data>
}

/** The type witness a child definition declares in place of a `create`. */
export interface Shape<D, Data> {
  readonly witness?: Witness<D, Data>
}

const shapeWitness: Shape<never, never> = {}

/** Declares the driver and data types of a child definition, whose handles only a parent's child entry acquires. */
export const shape = <D, Data extends object>(): Shape<D, Data> => shapeWitness

export type Operation<D, H> = (driver: D, self: H, ...args: never[]) => Effect.Effect<Top, Top, Top>

export type StreamOperation<D, H> = (driver: D, self: H, ...args: never[]) => Stream.Stream<Top, Top, Top>

export type ReleaseStep<D, H> = (driver: D, self: H) => Effect.Effect<Top, Top>

/**
 * Release stages run in order, and every stage runs. Within a stage each step is an escalation:
 * a step runs only when the step before it failed or died, and a stage whose last attempted step
 * failed dies with that failure.
 */
export type Release<D, H> = ReadonlyArray<ReadonlyArray<ReleaseStep<D, H>>>

export interface ChildEntry<D, H> {
  readonly handle: AnyChildDefinition
  readonly create: (driver: D, self: H, ...args: never[]) => Effect.Effect<Acquired<Top, object>, Top, Top>
}

type NoMembers = Record<never, never>

export type Built<Op, H> = Op extends (driver: never, self: never, ...args: infer Args) => infer Out ? {
    (...args: Args): (self: H) => Out
    (self: H, ...args: Args): Out
  }
  : never

export type BuiltOperations<Ops, H> = { readonly [K in keyof Ops]: Built<Ops[K], H> }

type ChildName<C> = C extends { readonly [DefinitionTypeId]: { readonly name: infer N extends string } } ? N : never

type ChildData<C> = C extends { readonly [DefinitionTypeId]: { readonly witness?: { readonly data: infer Data } } }
  ? Data
  : never

type ChildDriver<C> = C extends { readonly [DefinitionTypeId]: { readonly witness?: { readonly driver: infer D } } } ? D
  : never

export type BuiltChild<Entry, H> = Entry extends {
  readonly handle: infer C
  readonly create: (driver: never, self: never, ...args: infer Args) => Effect.Effect<Top, infer E, infer R>
} ? {
    (...args: Args): (self: H) => Effect.Effect<Handle<ChildName<C>, ChildData<C>>, E, R | Scope.Scope>
    (self: H, ...args: Args): Effect.Effect<Handle<ChildName<C>, ChildData<C>>, E, R | Scope.Scope>
  }
  : never

export type BuiltChildren<Children, H> = { readonly [K in keyof Children]: BuiltChild<Children[K], H> }

export interface Members<Ops, Streams, Children, H> {
  readonly operations: BuiltOperations<Ops, H>
  readonly streams: BuiltOperations<Streams, H>
  readonly children: BuiltChildren<Children, H>
}

export interface Definition<Name extends string, D, Data, Ops, Streams, Children>
  extends Members<Ops, Streams, Children, Handle<Name, Data>>
{
  readonly [DefinitionTypeId]: DefinitionBrand<Name, D, Data>
  readonly name: Name
  readonly is: (u: unknown) => u is Handle<Name, Data>
}

/** A definition whose handles only a parent definition's child entry acquires. */
export type ChildDefinition<Name extends string, D, Data, Ops, Streams, Children> = Definition<
  Name,
  D,
  Data,
  Ops,
  Streams,
  Children
>

export interface AnyChildDefinition {
  readonly [DefinitionTypeId]: DefinitionBrand<string, Top, object>
}

/**
 * A definition with a `create`: its handles are acquired from data input, with the release
 * registered in the caller's Scope in the same step that creates the driver.
 */
export interface RootDefinition<
  Name extends string,
  Input,
  D,
  Data,
  E,
  R,
  Ops,
  Streams,
  Children,
  Provided,
  ProvideE,
  ProvideR,
> extends Definition<Name, D, Data, Ops, Streams, Children> {
  readonly acquire: (input: Input) => Effect.Effect<Handle<Name, Data>, E, R | Scope.Scope>
  readonly context: (
    self: Handle<Name, Data>,
  ) => Effect.Effect<Context.Context<Provided>, ProvideE, ProvideR | Scope.Scope>
}

export interface AnyRootDefinition {
  readonly [DefinitionTypeId]: DefinitionBrand<string, Top, object>
  readonly acquire: (input: never) => Effect.Effect<HandleOf<string>, Top, Top>
  readonly context: (self: never) => Effect.Effect<Context.Context<never>, Top, Top>
}

// ---------------------------------------------------------------------------
// Refusals: each resolves to `Top` when the law holds, and to a marker member the
// definition's options cannot carry when it does not.
// ---------------------------------------------------------------------------

type IsTop<T> = Top extends T ? true : false

type IsFunction<T> = T extends (...args: never[]) => Top ? true : false

type DriverParts<D> =
  | D
  | {
    [K in keyof D]-?: D[K] extends (...args: never[]) => Top ? never : D[K] extends object ? D[K] : never
  }[keyof D]

type Accepts<T, P> = P extends P ? ([P] extends [T] ? true : false) : never

type Previous = [0, 0, 1]

type HoldsAt<T, D, N extends 0 | 1 | 2> = IsTop<T> extends true ? true
  : true extends Accepts<T, DriverParts<D>> ? true
  : N extends 0 ? false
  : T extends ReadonlyArray<infer Element> ? HoldsAt<Element, D, Previous[N]>
  : T extends (...args: never[]) => Top ? false
  : T extends object
    ? (true extends { [K in keyof T & string]-?: HoldsAt<T[K], D, Previous[N]> }[keyof T & string] ? true
      : false)
  : false

/**
 * `true` when a value of type `T` can hold the driver `D` or one of its object-valued parts:
 * `T` is `unknown`, accepts the driver or a part, or carries one in a member or element.
 */
export type Holds<T, D> = HoldsAt<T, D, 2>

export interface DataIsFunction<K extends string> {
  readonly __HANDLE_DATA_IS_FUNCTION__:
    `handle data member '${K}' is a function; a handle carries data, and its operations are standalone functions`
}

export interface DataHoldsDriver<K extends string> {
  readonly __HANDLE_DATA_HOLDS_DRIVER__:
    `handle data member '${K}' can hold the driver; the driver stays inside the definition's operations`
}

export interface InputHoldsDriver {
  readonly __HANDLE_INPUT_HOLDS_DRIVER__:
    'the create input can hold the driver; a handle is created from data, never around a driver the caller holds'
}

export interface OperationLendsDriver<K extends string> {
  readonly __HANDLE_OPERATION_LENDS_DRIVER__:
    `operation '${K}' succeeds with a function or a value that can hold the driver`
}

export interface OperationTakesDriverCallback<K extends string> {
  readonly __HANDLE_OPERATION_TAKES_DRIVER_CALLBACK__: `operation '${K}' takes a function that accepts the driver`
}

export interface StreamLendsDriver<K extends string> {
  readonly __HANDLE_STREAM_LENDS_DRIVER__: `stream '${K}' emits a function or an element that can hold the driver`
}

export interface ChildShapeMismatch<K extends string> {
  readonly __HANDLE_CHILD_SHAPE_MISMATCH__:
    `child '${K}' creates a driver and data its child definition does not declare`
}

export interface IntegrationOutputUndeclared {
  readonly __HANDLE_INTEGRATION_OUTPUT_UNDECLARED__:
    'every service the integration outputs must be class-declared with Context.Service, so its shape can be checked'
}

export interface IntegrationOutputLendsDriver {
  readonly __HANDLE_INTEGRATION_OUTPUT_LENDS_DRIVER__:
    'a service the integration outputs has a shape that can hold the driver; provide the driver to the library with Layer.provide, not Layer.provideMerge'
}

type Refusal<Keys, Marker> = [Keys] extends [never] ? Top : Marker

type FunctionDataKeys<Data> = { [K in keyof Data]-?: true extends IsFunction<Data[K]> ? K : never }[keyof Data]

type DriverDataKeys<Data, D> = { [K in keyof Data]-?: true extends Holds<Data[K], D> ? K : never }[keyof Data]

type DataLaw<D, Data> =
  & Refusal<FunctionDataKeys<Data>, DataIsFunction<FunctionDataKeys<Data> & string>>
  & Refusal<DriverDataKeys<Data, D>, DataHoldsDriver<DriverDataKeys<Data, D> & string>>

type InputLaw<Input, D> = true extends Holds<Input, D> ? InputHoldsDriver : Top

type Lends<A, D> = true extends IsFunction<A> ? true : true extends Holds<A, D> ? true : false

type LendingOperationKeys<Ops, D> = {
  [K in keyof Ops]-?: Ops[K] extends (driver: never, self: never, ...args: never[]) => Effect.Effect<infer A, Top, Top>
    ? (true extends Lends<A, D> ? K : never)
    : never
}[keyof Ops]

type AcceptsDriver<F, D> = F extends (...params: infer P) => Top ? (true extends Holds<P[number], D> ? true : false)
  : false

type CallbackOperationKeys<Ops, D> = {
  [K in keyof Ops]-?: Ops[K] extends (driver: never, self: never, ...args: infer Args) => Top
    ? (true extends AcceptsDriver<Args[number], D> ? K : never)
    : never
}[keyof Ops]

type LendingStreamKeys<Streams, D> = {
  [K in keyof Streams]-?: Streams[K] extends
    (driver: never, self: never, ...args: never[]) => Stream.Stream<infer A, Top, Top>
    ? (true extends Lends<A, D> ? K : never)
    : never
}[keyof Streams]

type MismatchedChildKeys<Children> = {
  [K in keyof Children]-?: Children[K] extends {
    readonly handle: infer C
    readonly create: (driver: never, self: never, ...args: never[]) => Effect.Effect<infer Made, Top, Top>
  } ? ([Made] extends [Acquired<ChildDriver<C>, ChildData<C>>] ? never : K)
    : K
}[keyof Children]

type OperationLaw<Ops, Streams, Children, D> =
  & Refusal<LendingOperationKeys<Ops, D>, OperationLendsDriver<LendingOperationKeys<Ops, D> & string>>
  & Refusal<CallbackOperationKeys<Ops, D>, OperationTakesDriverCallback<CallbackOperationKeys<Ops, D> & string>>
  & Refusal<LendingStreamKeys<Streams, D>, StreamLendsDriver<LendingStreamKeys<Streams, D> & string>>
  & Refusal<MismatchedChildKeys<Children>, ChildShapeMismatch<MismatchedChildKeys<Children> & string>>

type UndeclaredOutputs<Out> = Out extends { readonly Service: Top } ? never : Out

type LendingOutputs<Out, D> = Out extends { readonly Service: infer S } ? (true extends Holds<S, D> ? Out : never)
  : never

type IntegrationLaw<Out, D> =
  & Refusal<UndeclaredOutputs<Out>, IntegrationOutputUndeclared>
  & Refusal<LendingOutputs<Out, D>, IntegrationOutputLendsDriver>

// ---------------------------------------------------------------------------
// Options
// ---------------------------------------------------------------------------

export interface CommonOptions<Name extends string, D, Data, Ops, Streams, Children> {
  readonly name: Name
  readonly release?: Release<D, Handle<Name, Data>>
  readonly operations?: Ops & Readonly<Record<string, Operation<D, Handle<Name, Data>>>>
  readonly streams?: Streams & Readonly<Record<string, StreamOperation<D, Handle<Name, Data>>>>
  readonly children?: Children & Readonly<Record<string, ChildEntry<D, Handle<Name, Data>>>>
}

export interface RootOptions<
  Name extends string,
  Input,
  D,
  Data,
  E,
  R,
  Ops,
  Streams,
  Children,
  Provided,
  Out,
  IntegrationE,
  IntegrationR,
> extends CommonOptions<Name, D, Data, Ops, Streams, Children> {
  readonly create: (input: Input) => Effect.Effect<Acquired<D, Data>, E, R>
  readonly services?: (
    self: Handle<Name, Data>,
    members: Members<Ops, Streams, Children, Handle<Name, Data>>,
  ) => Context.Context<Provided>
  readonly integration?: (driver: D, self: Handle<Name, Data>) => Layer.Layer<Out, IntegrationE, IntegrationR>
}

export interface ChildOptions<Name extends string, D, Data, Ops, Streams, Children>
  extends CommonOptions<Name, D, Data, Ops, Streams, Children>
{
  readonly shape: Shape<D, Data>
}

// ---------------------------------------------------------------------------
// Runtime
// ---------------------------------------------------------------------------

interface Carrier {
  readonly driver: Top
  readonly released: Ref.Ref<boolean>
}

type Minter = <E, R>(
  creation: Effect.Effect<Acquired<Top, object>, E, R>,
) => Effect.Effect<object, E, R | Scope.Scope>

interface AnyChildEntry<E, R> {
  readonly handle: object
  readonly create: (
    driver: Top,
    self: object,
    ...args: ReadonlyArray<Top>
  ) => Effect.Effect<Acquired<Top, object>, E, R>
}

interface AnyMembers {
  readonly operations: Readonly<Record<string, Top>>
  readonly streams: Readonly<Record<string, Top>>
  readonly children: Readonly<Record<string, Top>>
}

interface AnyOptions<E, R> {
  readonly name: string
  readonly create?: (input: Top) => Effect.Effect<Acquired<Top, object>, E, R>
  readonly release?: ReadonlyArray<ReadonlyArray<(driver: Top, self: object) => Effect.Effect<Top, E>>>
  readonly operations?: Readonly<
    Record<string, (driver: Top, self: object, ...args: ReadonlyArray<Top>) => Effect.Effect<Top, E, R>>
  >
  readonly streams?: Readonly<
    Record<string, (driver: Top, self: object, ...args: ReadonlyArray<Top>) => Stream.Stream<Top, E, R>>
  >
  readonly children?: Readonly<Record<string, AnyChildEntry<E, R>>>
  readonly services?: (self: object, members: AnyMembers) => Context.Context<never>
  readonly integration?: (driver: Top, self: object) => Layer.Layer<never, E, R>
}

function assertCarried(_self: object): asserts _self is { readonly [Slot]: Carrier } {}

function assertMinting(_definition: object): asserts _definition is { readonly [Mint]: Minter } {}

const carrierOf = (self: object): Carrier => {
  assertCarried(self)
  return self[Slot]
}

const minterOf = (definition: object): Minter => {
  assertMinting(definition)
  return definition[Mint]
}

const orNone = <A>(entries: Readonly<Record<string, A>> | undefined): Readonly<Record<string, A>> => entries ?? {}

const escalateAfter = <E>(rest: ReadonlyArray<Effect.Effect<Top, E>>, cause: Cause.Cause<E>): Effect.Effect<void> =>
  Arr.match(rest, {
    onEmpty: () => cause.pipe(Cause.squash, Effect.die),
    onNonEmpty: (remaining) => escalate(remaining),
  })

/** Runs one stage's steps as an escalation: the stage ends at the first step that succeeds. */
const escalate = <E>(steps: ReadonlyArray<Effect.Effect<Top, E>>): Effect.Effect<void> =>
  Arr.match(steps, {
    onEmpty: () => Effect.void,
    onNonEmpty: ([step, ...rest]) =>
      Effect.matchCauseEffect(step, {
        onSuccess: () => Effect.void,
        onFailure: (cause) => escalateAfter(rest, cause),
      }),
  })

/** Runs every stage in order; the exit carries one defect per stage whose last attempted step failed. */
const releaseStages = <E>(stages: ReadonlyArray<ReadonlyArray<Effect.Effect<Top, E>>>): Effect.Effect<void> =>
  Effect.forEach(stages, (stage) => Effect.exit(escalate(stage))).pipe(
    Effect.map((exits) => Arr.filter(exits, Exit.isFailure)),
    Effect.flatMap((failures) =>
      Arr.match(failures, {
        onEmpty: () => Effect.void,
        onNonEmpty: (dead) =>
          Effect.failCause(Arr.reduce(dead, Cause.empty, (combined, exit) => Cause.combine(combined, exit.cause))),
      })
    ),
  )

const isBranded = (brand: Brand<string>) => (u: Top): u is object =>
  Predicate.hasProperty(u, HandleTypeId) && u[HandleTypeId] === brand

const liveDriver = (name: string, carrier: Carrier) =>
<A, E, R>(
  body: (driver: Top) => Effect.Effect<A, E, R>,
): Effect.Effect<A, E, R> =>
  Effect.flatMap(
    Ref.get(carrier.released),
    (released) => (released ? Effect.die(new HandleReleased({ handle: name })) : body(carrier.driver)),
  )

const whileLive = <A, E, R>(
  name: string,
  self: object,
  body: (driver: Top) => Effect.Effect<A, E, R>,
): Effect.Effect<A, E, R> => liveDriver(name, carrierOf(self))(body)

const releaseOf =
  <E>(stages: ReadonlyArray<ReadonlyArray<(driver: Top, self: object) => Effect.Effect<Top, E>>>) =>
  (self: object): Effect.Effect<void> => {
    const carrier = carrierOf(self)
    return Effect.andThen(
      Ref.set(carrier.released, true),
      releaseStages(Arr.map(stages, (stage) => Arr.map(stage, (step) => step(carrier.driver, self)))),
    )
  }

const minterFor = <E>(
  brand: Brand<string>,
  stages: ReadonlyArray<ReadonlyArray<(driver: Top, self: object) => Effect.Effect<Top, E>>>,
): Minter =>
(creation) =>
  Effect.acquireRelease(
    Effect.flatMap(creation, (acquired) =>
      Effect.map(Ref.make(false), (released) => ({
        ...acquired.data,
        [HandleTypeId]: brand,
        [Slot]: { driver: acquired.driver, released },
        ...Prototype,
      }))),
    releaseOf(stages),
  )

const dualOver = <Out>(is: (u: Top) => u is object, body: (self: object, ...args: ReadonlyArray<Top>) => Out) =>
  dual((args: IArguments) => is(args[0]), body)

const buildMembers = <E, R>(options: AnyOptions<E, R>, is: (u: Top) => u is object): AnyMembers => ({
  operations: Object.fromEntries(
    Object.entries(orNone(options.operations)).map(([key, operation]) => [
      key,
      dualOver(is, (self, ...args) => whileLive(options.name, self, (driver) => operation(driver, self, ...args))),
    ]),
  ),
  streams: Object.fromEntries(
    Object.entries(orNone(options.streams)).map(([key, stream]) => [
      key,
      dualOver(
        is,
        (self, ...args) =>
          Stream.unwrap(whileLive(options.name, self, (driver) => Effect.sync(() => stream(driver, self, ...args)))),
      ),
    ]),
  ),
  children: Object.fromEntries(
    Object.entries(orNone(options.children)).map(([key, child]) => [
      key,
      dualOver(
        is,
        (self, ...args) =>
          whileLive(options.name, self, (driver) => minterOf(child.handle)(child.create(driver, self, ...args))),
      ),
    ]),
  ),
})

const providedBy = <E, R>(options: AnyOptions<E, R>, members: AnyMembers, self: object): Context.Context<never> =>
  options.services === undefined ? Context.empty() : options.services(self, members)

const integrated = <E, R>(
  options: AnyOptions<E, R>,
  driver: Top,
  self: object,
  provided: Context.Context<never>,
): Effect.Effect<Context.Context<never>, E, R | Scope.Scope> =>
  options.integration === undefined
    ? Effect.succeed(provided)
    : Effect.map(Layer.build(options.integration(driver, self)), (built) => Context.merge(provided, built))

const acquisitionOf = <E, R>(options: AnyOptions<E, R>, mint: Minter, members: AnyMembers) => {
  const create = options.create
  return create === undefined ? {} : {
    acquire: (input: Top) => mint(create(input)),
    context: (self: object) =>
      whileLive(options.name, self, (driver) => integrated(options, driver, self, providedBy(options, members, self))),
  }
}

const makeDefinition = <E, R>(options: AnyOptions<E, R>): object => {
  const brand: Brand<string> = { name: options.name }
  const is = isBranded(brand)
  const mint = minterFor(brand, options.release ?? [])
  const members = buildMembers(options, is)
  return {
    [DefinitionTypeId]: brand,
    [Mint]: mint,
    name: options.name,
    is,
    ...members,
    ...acquisitionOf(options, mint, members),
  }
}

/**
 * Declares a handle kind. With a `create`, the definition acquires handles from data input and
 * registers each handle's release in the caller's Scope in the same uninterruptible step that
 * creates the driver. With a `shape`, it declares a child whose handles only a parent's child
 * entry acquires.
 *
 * Every operation, stream, child creator, release step, and integration receives the driver as
 * its first parameter and the handle as its second; the kind returns each operation as a dual
 * over the handle that dies with {@link HandleReleased} once release has started.
 */
export function make<
  const Name extends string,
  D,
  Data extends object,
  Ops extends Readonly<Record<string, Operation<D, Handle<Name, Data>>>> = NoMembers,
  Streams extends Readonly<Record<string, StreamOperation<D, Handle<Name, Data>>>> = NoMembers,
  Children extends Readonly<Record<string, ChildEntry<D, Handle<Name, Data>>>> = NoMembers,
>(
  options:
    & ChildOptions<Name, D, Data, Ops, Streams, Children>
    & { readonly name: DataLaw<D, Data> & OperationLaw<Ops, Streams, Children, D> },
): ChildDefinition<Name, D, Data, Ops, Streams, Children>
export function make<
  const Name extends string,
  Input,
  D,
  Data extends object,
  E,
  R,
  Ops extends Readonly<Record<string, Operation<D, Handle<Name, Data>>>> = NoMembers,
  Streams extends Readonly<Record<string, StreamOperation<D, Handle<Name, Data>>>> = NoMembers,
  Children extends Readonly<Record<string, ChildEntry<D, Handle<Name, Data>>>> = NoMembers,
  Provided = never,
  Out = never,
  IntegrationE = never,
  IntegrationR = never,
>(
  options:
    & RootOptions<Name, Input, D, Data, E, R, Ops, Streams, Children, Provided, Out, IntegrationE, IntegrationR>
    & {
      readonly name:
        & DataLaw<D, Data>
        & InputLaw<Input, D>
        & OperationLaw<Ops, Streams, Children, D>
        & IntegrationLaw<Out, D>
    },
): RootDefinition<Name, Input, D, Data, E, R, Ops, Streams, Children, Provided | Out, IntegrationE, IntegrationR>
export function make(options: { readonly name: string }): object {
  assertOptions(options)
  return makeDefinition(options)
}

function assertOptions(_options: object): asserts _options is AnyOptions<never, never> {}

if (import.meta.vitest !== void 0) {
  const { it } = await import('@effect/vitest')
  const Match = await import('effect/Match')
  const Option = await import('effect/Option')
  const Schema = await import('effect/Schema')

  const Outcome = Schema.Literals(['succeed', 'fail', 'die'])
  const Stage = Schema.Array(Outcome).pipe(Schema.check(Schema.isMaxLength(3)))
  const Stages = Schema.Tuple([Stage, Stage])

  type Outcome = typeof Outcome.Type

  const outcomeOf = (label: string, outcome: Outcome): Effect.Effect<void, string> =>
    Match.value(outcome).pipe(
      Match.when('succeed', (): Effect.Effect<void, string> => Effect.void),
      Match.when('fail', (): Effect.Effect<void, string> => Effect.fail(label)),
      Match.when('die', (): Effect.Effect<void, string> => Effect.die(label)),
      Match.exhaustive,
    )

  const stepOf = (log: Ref.Ref<ReadonlyArray<string>>, label: string, outcome: Outcome): Effect.Effect<void, string> =>
    Effect.andThen(Ref.update(log, (entries) => [...entries, label]), outcomeOf(label, outcome))

  const attemptedOf = (stage: ReadonlyArray<Outcome>): number =>
    Option.match(Arr.findFirstIndex(stage, (outcome) => outcome === 'succeed'), {
      onNone: () => stage.length,
      onSome: (index) => index + 1,
    })

  const labelsOf = (stages: ReadonlyArray<ReadonlyArray<Outcome>>): ReadonlyArray<string> =>
    stages.flatMap((stage, index) => stage.slice(0, attemptedOf(stage)).map((_, step) => `${index}.${step}`))

  const deathOf = (stage: ReadonlyArray<Outcome>, index: number): ReadonlyArray<string> =>
    Arr.match(stage, {
      onEmpty: () => [],
      onNonEmpty: (steps) => (steps.includes('succeed') ? [] : [`${index}.${steps.length - 1}`]),
    })

  const defectsOf = (exit: Exit.Exit<void>): ReadonlyArray<Top> =>
    Exit.match(exit, {
      onSuccess: () => [],
      onFailure: (cause) => cause.reasons.filter(Cause.isDieReason).map((reason) => reason.defect),
    })

  const holds = (verdicts: ReadonlyArray<boolean>): boolean => Arr.every(verdicts, (verdict) => verdict)

  it.effect.prop('∀s_Release_=StagedEscalation', [Stages], ([stages]) =>
    Effect.gen(function*() {
      const log = yield* Ref.make<ReadonlyArray<string>>([])
      const exit = yield* Effect.exit(
        releaseStages(
          stages.map((stage, index) => stage.map((outcome, step) => stepOf(log, `${index}.${step}`, outcome))),
        ),
      )
      const attempted = yield* Ref.get(log)
      const defects = defectsOf(exit)
      const deaths = stages.flatMap(deathOf)
      return holds([
        attempted.join() === labelsOf(stages).join(),
        defects.length === deaths.length,
        deaths.every((label) => defects.includes(label)),
      ])
    }))
}
