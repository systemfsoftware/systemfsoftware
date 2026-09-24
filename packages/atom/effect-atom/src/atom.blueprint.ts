/**
 * The atom kind: a cold description of one reactive value that a registry
 * evaluates.
 *
 * An atom is a {@link Blueprint} value. Its spec carries the read and write
 * functions and the settings a registry honours: keep-alive, laziness, idle
 * time-to-live, label, equality, serialization, and server value. Each
 * configuration step returns a new atom of the same variant. `read`, `write`,
 * `equals`, and `serverValue` are targets typed by the atom's value.
 *
 * @since 4.0.0
 */
import { Blueprint } from '@systemfsoftware/effect-cell-types'
import type * as Context from 'effect/Context'
import * as Duration from 'effect/Duration'
import type * as Effect from 'effect/Effect'
import { constant, dual } from 'effect/Function'
import type * as Option from 'effect/Option'
import type { ReadonlyRecord } from 'effect/Record'
import * as Schema from 'effect/Schema'
import type * as Stream from 'effect/Stream'
import type * as Reactivity from 'effect/unstable/reactivity/Reactivity'
import * as AsyncResult from './async-result.js'
import type { RuntimeMembers } from './atom-constructors.js'
import type { RegistryImpl } from './registry-engine.js'
import type * as Registry from './registry.handle.js'

type Top<A = unknown> = A

/**
 * The identity every atom carries.
 *
 * @since 4.0.0
 */
export const TypeId: unique symbol = Symbol.for('~effect/reactivity/Atom')

/**
 * @since 4.0.0
 */
export type TypeId = typeof TypeId

/**
 * Context passed to atom read functions for reading dependencies, awaiting `AsyncResult` or `Option` values, managing subscriptions and finalizers, refreshing atoms, and updating writable atoms.
 *
 * @since 4.0.0
 */
export interface AtomContext {
  <A>(atom: Atom<A>): A
  get<A>(this: AtomContext, atom: Atom<A>): A
  result<A, E>(this: AtomContext, atom: Atom<AsyncResult.Result<A, E>>, options?: {
    readonly suspendOnWaiting?: boolean | undefined
  }): Effect.Effect<A, E>
  resultOnce<A, E>(this: AtomContext, atom: Atom<AsyncResult.Result<A, E>>, options?: {
    readonly suspendOnWaiting?: boolean | undefined
  }): Effect.Effect<A, E>
  once<A>(this: AtomContext, atom: Atom<A>): A
  addFinalizer(this: AtomContext, f: () => void): void
  mount<A>(this: AtomContext, atom: Atom<A>): void
  refresh<A>(this: AtomContext, atom: Atom<A>): void
  refreshSelf(this: AtomContext): void
  self<A>(this: AtomContext): Option.Option<A>
  setSelf<A>(this: AtomContext, a: A): void
  set<R, W>(this: AtomContext, atom: Writable<R, W>, value: W): void
  setResult<A, E, W>(this: AtomContext, atom: Writable<AsyncResult.Result<A, E>, W>, value: W): Effect.Effect<A, E>
  some<A>(this: AtomContext, atom: Atom<Option.Option<A>>): Effect.Effect<A>
  someOnce<A>(this: AtomContext, atom: Atom<Option.Option<A>>): Effect.Effect<A>
  stream<A>(this: AtomContext, atom: Atom<A>, options?: {
    readonly withoutInitialValue?: boolean
    readonly bufferSize?: number
  }): Stream.Stream<A>
  streamResult<A, E>(this: AtomContext, atom: Atom<AsyncResult.Result<A, E>>, options?: {
    readonly withoutInitialValue?: boolean
    readonly bufferSize?: number
  }): Stream.Stream<A, E>
  subscribe<A>(this: AtomContext, atom: Atom<A>, f: (_: A) => void, options?: {
    readonly immediate?: boolean
  }): void
  isFn?: boolean | undefined
  readonly registry: RegistryImpl
}

/**
 * Context passed to writable atom write functions for reading atoms, refreshing or setting the current atom, and writing to other writable atoms.
 *
 * @since 4.0.0
 */
export interface WriteContext<A> {
  readonly registry: Registry.Registry
  get<T>(this: WriteContext<A>, atom: Atom<T>): T
  refreshSelf(this: WriteContext<A>): void
  setSelf(this: WriteContext<A>, a: A): void
  set<R, W>(this: WriteContext<A>, atom: Writable<R, W>, value: W): void
}

/**
 * JSON values a serializable atom's codec encodes to.
 *
 * @since 4.0.0
 */
export type SerializableJson =
  | string
  | number
  | boolean
  | null
  | ReadonlyArray<SerializableJson>
  | { readonly [key: string]: SerializableJson }

/**
 * The serialization an atom carries: the key naming it in dehydrated state and the JSON codec for its value.
 *
 * @since 4.0.0
 */
export interface SerializableSpec<S extends Schema.Constraint = Schema.Constraint> {
  readonly key: string
  readonly codecJson: Schema.toCodecJson<S>
}

/**
 * The runtime members an atom spec stores, with their service and error types erased.
 *
 * @since 4.0.0
 */
export interface ErasedRuntime {
  readonly factory: RuntimeMembers<never, never>['factory']
  readonly layer: Atom
  readonly atom: (...args: never[]) => Top
  readonly fn: (...args: never[]) => Top
  readonly pull: (...args: never[]) => Top
  readonly subscriptionRef: (...args: never[]) => Top
}

/**
 * The cold description one atom carries.
 *
 * **Details**
 *
 * Functions are stored with their value type erased; the `read`, `write`,
 * `equals`, and `serverValue` targets read them back typed by the atom.
 *
 * @since 4.0.0
 */
export interface AtomSpec {
  readonly read: (get: AtomContext) => Top
  readonly write: ((ctx: WriteContext<never>, value: never) => void) | undefined
  readonly equals: (value: never, next: never) => boolean
  readonly refresh: Refresh | undefined
  readonly keepAlive: boolean
  readonly lazy: boolean
  readonly label: readonly [name: string, stack: string] | undefined
  readonly idleTTL: number | undefined
  readonly initialValueTarget: Atom | undefined
  readonly serializable: SerializableSpec | undefined
  readonly serverValue: ((get: <A>(atom: Atom<A>) => A) => Top) | undefined
  readonly runtime: ErasedRuntime | undefined
}

/**
 * A custom refresh: the atoms to refresh when this atom is refreshed.
 *
 * @since 4.0.0
 */
export type Refresh = (f: <A>(atom: Atom<A>) => void) => void

/**
 * The type index of an atom: the value it reads.
 *
 * @since 4.0.0
 */
export interface AtomIndex {
  readonly Value: Top
}

/**
 * The type index of a writable atom: the value it reads and the input it accepts.
 *
 * @since 4.0.0
 */
export interface WritableIndex extends AtomIndex {
  readonly Write: (value: never) => void
}

type ValueOf<X> = X extends { readonly Value: infer A } ? A : never

type WriteOf<X> = X extends { readonly Write: (value: infer W) => void } ? W : never

type ServicesOf<X> = ValueOf<X> extends AsyncResult.Result<Context.Context<infer R>, infer _> ? R : never

type RuntimeErrorOf<X> = ValueOf<X> extends AsyncResult.Result<infer _, infer E> ? E : never

interface Equivalent<A> {
  bivariant(value: A, next: A): boolean
}

/**
 * A server-side read of an atom's value.
 *
 * @since 4.0.0
 */
export type ServerRead<A> = (get: <A2>(atom: Atom<A2>) => A2) => A

interface Read extends Blueprint.Target {
  readonly target: (get: AtomContext) => ValueOf<this['Index']>
}

interface Equals extends Blueprint.Target {
  readonly target: Equivalent<ValueOf<this['Index']>>['bivariant']
}

interface ServerValue extends Blueprint.Target {
  readonly target: ServerRead<ValueOf<this['Index']>> | undefined
}

interface Write extends Blueprint.Target {
  readonly target: (ctx: WriteContext<ValueOf<this['Index']>>, value: WriteOf<this['Index']>) => void
}

interface RuntimeTarget<K extends keyof ErasedRuntime> extends Blueprint.Target {
  readonly target: RuntimeMembers<ServicesOf<this['Index']>, RuntimeErrorOf<this['Index']>>[K]
}

interface KeepAlive extends Blueprint.Step<readonly []> {
  readonly last: <A extends Atom>(self: A) => A
}

interface AutoDispose extends Blueprint.Step<readonly []> {
  readonly last: <A extends Atom>(self: A) => A
}

interface WithServerValueInitial extends Blueprint.Step<readonly []> {
  readonly last: <A extends Atom<AsyncResult.Result<Top, Top>>>(self: A) => A
}

interface SetLazy extends Blueprint.Step<readonly [lazy: boolean]> {
  readonly last: (lazy: boolean) => <A extends Atom>(self: A) => A
}

interface WithLabel extends Blueprint.Step<readonly [name: string]> {
  readonly last: (name: string) => <A extends Atom>(self: A) => A
}

interface SetIdleTTL extends Blueprint.Step<readonly [duration: Duration.Input]> {
  readonly last: (duration: Duration.Input) => <A extends Atom>(self: A) => A
}

/**
 * The invalidation keys a `Reactivity` service refreshes an atom on.
 *
 * @since 4.0.0
 */
export type ReactivityKeys = ReadonlyArray<Top> | ReadonlyRecord<string, ReadonlyArray<Top>>

/**
 * The atom that resolves the `Reactivity` service an atom registers its keys with.
 *
 * @since 4.0.0
 */
export type ReactivityAtom = Atom<AsyncResult.Result<Reactivity.Reactivity>>

interface WithReactivity extends Blueprint.Operation {
  readonly params: readonly [keys: ReactivityKeys, reactivity: ReactivityAtom]
  readonly lastFirst: ReactivityKeys
  readonly lastRest: readonly [reactivity: ReactivityAtom]
  readonly out: this['Self']
  readonly last: (keys: ReactivityKeys, reactivity: ReactivityAtom) => <A extends Atom>(self: A) => A
}

interface WithEquality extends Blueprint.Operation {
  readonly params: readonly [equals: Equivalent<ValueOf<this['Index']>>['bivariant']]
  readonly lastFirst: never
  readonly lastRest: readonly []
  readonly out: this['Self']
  readonly last: <T extends Atom>(equals: (value: Type<T>, next: Type<T>) => boolean) => (self: T) => T
}

interface WithServerValue extends Blueprint.Operation {
  readonly params: readonly [read: ServerRead<ValueOf<this['Index']>>]
  readonly lastFirst: never
  readonly lastRest: readonly []
  readonly out: this['Self']
  readonly last: <A extends Atom>(read: ServerRead<Type<A>>) => (self: A) => A
}

/**
 * The options that make an atom serializable: its dehydration key and the schema of its value.
 *
 * @since 4.0.0
 */
export interface SerializableOptions<S extends Schema.Constraint = Schema.Constraint> {
  readonly key: string
  readonly schema: S
}

type SchemaOf<Args> = Args extends readonly [SerializableOptions<infer S>] ? S : never

interface MakeSerializable extends Blueprint.Operation {
  readonly params: readonly [options: SerializableOptions]
  readonly lastFirst: never
  readonly lastRest: readonly []
  readonly out: this['Self'] & Serializable<SchemaOf<this['Args']>>
  readonly last: <S extends Schema.Constraint>(
    options: SerializableOptions<S>,
  ) => <R extends Atom>(self: R) => R & Serializable<S>
}

/**
 * The operations and targets every atom carries.
 *
 * @since 4.0.0
 */
export interface AtomOps {
  readonly keepAlive: KeepAlive
  readonly autoDispose: AutoDispose
  readonly setLazy: SetLazy
  readonly withLabel: WithLabel
  readonly setIdleTTL: SetIdleTTL
  readonly withEquality: WithEquality
  readonly withServerValue: WithServerValue
  readonly withServerValueInitial: WithServerValueInitial
  readonly withReactivity: WithReactivity
  readonly serializable: MakeSerializable
  readonly read: Read
  readonly equals: Equals
  readonly serverValue: ServerValue
}

/**
 * The operations and targets a writable atom carries.
 *
 * @since 4.0.0
 */
export interface WritableOps extends AtomOps {
  readonly write: Write
}

/**
 * The operations and targets a runtime atom carries.
 *
 * @since 4.0.0
 */
export interface RuntimeOps extends AtomOps {
  readonly atom: RuntimeTarget<'atom'>
  readonly fn: RuntimeTarget<'fn'>
  readonly pull: RuntimeTarget<'pull'>
  readonly subscriptionRef: RuntimeTarget<'subscriptionRef'>
  readonly factory: RuntimeTarget<'factory'>
  readonly layer: RuntimeTarget<'layer'>
}

/**
 * Reactive value read by a registry, with settings controlling caching, laziness, refresh behavior, and initial value targeting.
 *
 * @since 4.0.0
 */
export type Atom<A = unknown> = Blueprint.Blueprint<TypeId, AtomSpec, AtomOps, { readonly Value: A }>

/**
 * Atom that can also be written to, using a `WriteContext` and an input value to update reactive state.
 *
 * @since 4.0.0
 */
export type Writable<R, W = R> = Blueprint.Blueprint<
  TypeId,
  AtomSpec,
  WritableOps,
  { readonly Value: R; readonly Write: (value: W) => void }
>

/**
 * An atom that builds a layer's services once per registry and constructs atoms that run with them.
 *
 * @since 4.0.0
 */
export type AtomRuntime<R, ER = never> = Blueprint.Blueprint<
  TypeId,
  AtomSpec,
  RuntimeOps,
  { readonly Value: AsyncResult.Result<Context.Context<R>, ER> }
>

/**
 * Serialization carried by an atom, typed by its schema.
 *
 * @since 4.0.0
 */
export interface Serializable<S extends Schema.Constraint> {
  readonly spec: { readonly serializable: SerializableSpec<S> }
}

/**
 * Extracts the value type produced by an `Atom`.
 *
 * @since 4.0.0
 */
export type Type<T extends Atom> = T extends { readonly read: (get: AtomContext) => infer A } ? A : never

/**
 * An atom reading `B` that keeps the write input of `R` when `R` is writable.
 *
 * @since 4.0.0
 */
export type With<R extends Atom, B> = R extends { readonly write: (ctx: never, value: infer W) => void }
  ? Writable<B, W>
  : Atom<B>

/**
 * An atom type without serializable metadata, preserving `Writable` read and write types when the input atom is writable.
 *
 * @since 4.0.0
 */
export type WithoutSerializable<T extends Atom> = With<T, Type<T>>

const defaults = {
  write: undefined,
  equals: Object.is,
  refresh: undefined,
  keepAlive: false,
  lazy: true,
  label: undefined,
  idleTTL: undefined,
  initialValueTarget: undefined,
  serializable: undefined,
  serverValue: undefined,
  runtime: undefined,
} as const

const stackLine = (stack: string): string => stack.split('\n')[5] ?? ''

/**
 * The call site that labelled an atom, read from the current stack.
 *
 * @since 4.0.0
 */
export const stackLabel = (): string => stackLine(new Error().stack ?? '')

const finiteMillis = (duration: Duration.Duration): number | undefined =>
  Duration.isFinite(duration) ? Duration.toMillis(duration) : undefined

const withIdleTTL = (spec: AtomSpec, input: Duration.Input): AtomSpec => {
  const duration = Duration.fromInputUnsafe(input)
  return { ...spec, keepAlive: !Duration.isFinite(duration), idleTTL: finiteMillis(duration) }
}

const labelFor = (spec: AtomSpec, key: string): readonly [string, string] => spec.label ?? [key, stackLabel()]

const withSerializable = (spec: AtomSpec, options: SerializableOptions): AtomSpec => ({
  ...spec,
  label: labelFor(spec, options.key),
  serializable: { key: options.key, codecJson: Schema.toCodecJson(options.schema) },
})

const refreshingOn = (spec: AtomSpec, keys: ReactivityKeys, reactivity: ReactivityAtom): AtomSpec => ({
  ...spec,
  read: (get) => {
    const store = AsyncResult.getOrThrow(get(reactivity))
    get.addFinalizer(store.registerUnsafe(keys, () => get.refreshSelf()))
    return spec.read(get)
  },
})

const operations = {
  keepAlive: (self: Atom) => remint({ ...self.spec, keepAlive: true }),
  autoDispose: (self: Atom) => remint({ ...self.spec, keepAlive: false }),
  setLazy: (self: Atom, lazy: boolean) => remint({ ...self.spec, lazy }),
  withLabel: (self: Atom, name: string) => remint({ ...self.spec, label: [name, stackLabel()] }),
  setIdleTTL: (self: Atom, duration: Duration.Input) => remint(withIdleTTL(self.spec, duration)),
  withEquality: (self: Atom, equals: (value: never, next: never) => boolean) => remint({ ...self.spec, equals }),
  withServerValue: (self: Atom, serverValue: ServerRead<Top>) => remint({ ...self.spec, serverValue }),
  withServerValueInitial: (self: Atom) => remint({ ...self.spec, serverValue: constant(AsyncResult.initial(true)) }),
  serializable: (self: Atom, options: SerializableOptions) => remint(withSerializable(self.spec, options)),
  withReactivity: (self: Atom, keys: ReactivityKeys, reactivity: ReactivityAtom) =>
    remint(refreshingOn(self.spec, keys, reactivity)),
}

const targets = {
  read: (self: Atom) => self.spec.read,
  equals: (self: Atom) => self.spec.equals,
  serverValue: (self: Atom) => self.spec.serverValue,
}

const Atoms = Blueprint.make<AtomSpec, AtomIndex>()(TypeId).operations<AtomOps>()({ operations, targets })

const Writables = Blueprint.make<AtomSpec, WritableIndex>()(TypeId).operations<WritableOps>()({
  operations,
  targets: { ...targets, write: (self: Atom) => self.spec.write },
})

const runtimeOf = (self: Atom): ErasedRuntime | undefined => self.spec.runtime

const Runtimes = Blueprint.make<AtomSpec, AtomIndex>()(TypeId).operations<RuntimeOps>()({
  operations,
  targets: {
    ...targets,
    atom: (self: Atom) => runtimeOf(self)?.atom,
    fn: (self: Atom) => runtimeOf(self)?.fn,
    pull: (self: Atom) => runtimeOf(self)?.pull,
    subscriptionRef: (self: Atom) => runtimeOf(self)?.subscriptionRef,
    factory: (self: Atom) => runtimeOf(self)?.factory,
    layer: (self: Atom) => runtimeOf(self)?.layer,
  },
})

const mintPlain = (spec: AtomSpec): Atom => (spec.write === undefined ? Atoms.of(spec) : Writables.of(spec))

function remint(spec: AtomSpec): Atom {
  if (spec.runtime === undefined) {
    return mintPlain(spec)
  }
  return Runtimes.of(spec)
}

/**
 * Returns `true` when a value is an `Atom`.
 *
 * @since 4.0.0
 */
export const isAtom = Atoms.is

/**
 * Returns `true` when an atom is writable.
 *
 * @since 4.0.0
 */
export const isWritable = <R, W>(atom: Atom<R>): atom is Writable<R, W> => atom.spec.write !== undefined

/**
 * Returns `true` when an atom carries serialization.
 *
 * @since 4.0.0
 */
export const isSerializable = <A>(self: Atom<A>): self is Atom<A> & Serializable<Schema.Constraint> =>
  self.spec.serializable !== undefined

/**
 * Creates a read-only atom from a read function and an optional custom refresh registration callback.
 *
 * @since 4.0.0
 */
export const readable: {
  <A>(read: (get: AtomContext) => A, refresh?: Refresh): Atom<A>
  (refresh?: Refresh): <A>(read: (get: AtomContext) => A) => Atom<A>
} = dual(
  (args) => args.length !== 0,
  <A>(read: (get: AtomContext) => A, refresh?: Refresh): Atom<A> =>
    Atoms.of<{ readonly Value: A }>({ ...defaults, read, refresh }),
)

/**
 * Creates a writable atom from read and write functions, with an optional custom refresh registration callback.
 *
 * @since 4.0.0
 */
export const writable: {
  <R, W>(read: (get: AtomContext) => R, write: (ctx: WriteContext<R>, value: W) => void, refresh?: Refresh): Writable<
    R,
    W
  >
  <R, W>(write: (ctx: WriteContext<R>, value: W) => void, refresh?: Refresh): (
    read: (get: AtomContext) => R,
  ) => Writable<R, W>
} = dual(
  (args) => args.length >= 2,
  <R, W>(read: (get: AtomContext) => R, write: (ctx: WriteContext<R>, value: W) => void, refresh?: Refresh) =>
    Writables.of<{ readonly Value: R; readonly Write: (value: W) => void }>({ ...defaults, read, write, refresh }),
)

/**
 * Creates a runtime atom from its read function and the members its factory builds.
 *
 * @since 4.0.0
 */
export const runtime = <R, ER>(parts: {
  readonly read: (get: AtomContext) => AsyncResult.Result<Context.Context<R>, ER>
  readonly members: RuntimeMembers<R, ER>
}): AtomRuntime<R, ER> =>
  Runtimes.of<{ readonly Value: AsyncResult.Result<Context.Context<R>, ER> }>({
    ...defaults,
    read: parts.read,
    runtime: parts.members,
  })

const refreshThrough = (self: Atom): Refresh => self.spec.refresh ?? ((refresh) => refresh(self))

const rootTarget = (atom: Atom): Atom =>
  atom.spec.initialValueTarget === undefined ? atom : rootTarget(atom.spec.initialValueTarget)

const initialTargetOf = (target: Atom | undefined): Atom | undefined =>
  target === undefined ? undefined : rootTarget(target)

const forwardWrite = <A>(self: Writable<A, never>) => (ctx: WriteContext<never>, value: never): void => {
  ctx.set(self, value)
}

const writeThrough = <A>(self: Atom<A>): AtomSpec['write'] => (isWritable(self) ? forwardWrite(self) : undefined)

const derivedSpec = <R extends Atom, B>(
  self: R,
  f: (get: AtomContext, atom: R) => B,
  initialValueTarget: Atom<B> | undefined,
): AtomSpec => ({
  ...defaults,
  read: (get) => f(get, self),
  write: writeThrough(self),
  refresh: refreshThrough(self),
  idleTTL: 0,
  initialValueTarget: initialTargetOf(initialValueTarget),
})

const mintDerived = <B>(spec: AtomSpec): Atom<B> =>
  spec.write === undefined
    ? Atoms.of<{ readonly Value: B }>(spec)
    : Writables.of<{ readonly Value: B; readonly Write: (value: never) => void }>(spec)

/**
 * Creates a derived atom by reading another atom with a custom `AtomContext` function.
 *
 * **Details**
 *
 * If the source is writable, the derived atom keeps the source write input and
 * forwards writes to the source. `initialValueTarget` controls which atom receives
 * preloaded initial values for the derived atom.
 *
 * @since 4.0.0
 */
export const transform: {
  <R extends Atom, B>(
    f: (get: AtomContext, atom: R) => B,
    options?: { readonly initialValueTarget?: Atom<B> | undefined },
  ): (self: R) => With<R, B>
  <R extends Atom, B>(
    self: R,
    f: (get: AtomContext, atom: R) => B,
    options?: { readonly initialValueTarget?: Atom<B> | undefined },
  ): With<R, B>
} = dual(
  (args) => isAtom(args[0]),
  <R extends Atom, B>(
    self: R,
    f: (get: AtomContext, atom: R) => B,
    options?: { readonly initialValueTarget?: Atom<B> | undefined },
  ): Atom<B> => mintDerived<B>(derivedSpec(self, f, options?.initialValueTarget)),
)

/**
 * Returns a copy of an atom that remains cached and mounted even when no subscribers are using it.
 *
 * @since 4.0.0
 */
export const keepAlive: <A extends Atom>(self: A) => A = Atoms.operations.keepAlive

/**
 * Allows a reactive value to be disposed of when it is not in use.
 *
 * @since 4.0.0
 */
export const autoDispose: <A extends Atom>(self: A) => A = Atoms.operations.autoDispose

/**
 * Sets whether an atom should be lazy.
 *
 * @since 4.0.0
 */
export const setLazy: {
  (lazy: boolean): <A extends Atom>(self: A) => A
  <A extends Atom>(self: A, lazy: boolean): A
} = Atoms.operations.setLazy

/**
 * Names an atom, recording the call site that named it.
 *
 * @since 4.0.0
 */
export const withLabel: {
  (name: string): <A extends Atom>(self: A) => A
  <A extends Atom>(self: A, name: string): A
} = Atoms.operations.withLabel

/**
 * Returns a copy of an atom with an idle time-to-live: finite durations dispose it after inactivity, while an infinite duration keeps it alive.
 *
 * @since 4.0.0
 */
export const setIdleTTL: {
  (duration: Duration.Input): <A extends Atom>(self: A) => A
  <A extends Atom>(self: A, duration: Duration.Input): A
} = Atoms.operations.setIdleTTL

/**
 * Returns a copy of an atom that uses a custom equality function to detect value changes.
 *
 * @since 4.0.0
 */
export const withEquality: {
  <T extends Atom>(equals: (value: Type<T>, next: Type<T>) => boolean): (self: T) => T
  <T extends Atom>(self: T, equals: (value: Type<T>, next: Type<T>) => boolean): T
} = dual(
  2,
  <T extends Atom>(self: T, equals: (value: Type<T>, next: Type<T>) => boolean): T =>
    Atoms.operations.withEquality<T>(equals)(self),
)

/**
 * Sets the value of an atom when read on the server.
 *
 * @since 4.0.0
 */
export const withServerValue: {
  <A extends Atom>(read: ServerRead<Type<A>>): (self: A) => A
  <A extends Atom>(self: A, read: ServerRead<Type<A>>): A
} = dual(
  2,
  <A extends Atom>(self: A, read: ServerRead<Type<A>>): A => Atoms.operations.withServerValue<A>(read)(self),
)

/**
 * Sets an `AsyncResult` atom's server-side value to `AsyncResult.initial(true)`.
 *
 * @since 4.0.0
 */
export const withServerValueInitial: <A extends Atom<AsyncResult.Result<Top, Top>>>(self: A) => A =
  Atoms.operations.withServerValueInitial

/**
 * Attaches serialization to an atom using a schema and stable key.
 *
 * **Details**
 *
 * The schema is converted to a JSON codec used to encode values when a
 * registry is dehydrated and to decode them when one is hydrated; values that
 * fail either direction are recorded as refusals on the registry.
 *
 * @since 4.0.0
 */
export const serializable: {
  <S extends Schema.Constraint>(options: SerializableOptions<S>): <R extends Atom>(self: R) => R & Serializable<S>
  <R extends Atom, S extends Schema.Constraint>(self: R, options: SerializableOptions<S>): R & Serializable<S>
} = dual(
  2,
  <R extends Atom, S extends Schema.Constraint>(self: R, options: SerializableOptions<S>): R & Serializable<S> =>
    Atoms.operations.serializable(options)(self),
)

/**
 * Refreshes an atom whenever one of the keys changes in the `Reactivity` service the supplied atom resolves to.
 *
 * @since 4.0.0
 */
export const withReactivityOn: {
  (keys: ReactivityKeys, reactivity: ReactivityAtom): <A extends Atom>(self: A) => A
  <A extends Atom>(self: A, keys: ReactivityKeys, reactivity: ReactivityAtom): A
} = Atoms.operations.withReactivity
