import * as Duration from 'effect/Duration'
import * as Effect from 'effect/Effect'
import { dual } from 'effect/Function'
import * as MutableHashMap from 'effect/MutableHashMap'
import * as Option from 'effect/Option'
import type { NoInfer } from 'effect/Types'
import * as AsyncResult from './async-result.js'
import {
  type AnyAtom,
  type AnyResult,
  type AtomResultFn,
  fn,
  type FnContext,
  state,
  type Top,
} from './atom-constructors.js'
import {
  type Atom,
  type AtomContext,
  autoDispose,
  isAtom,
  isWritable,
  readable,
  setIdleTTL,
  transform,
  type Type,
  type With,
  type WithoutSerializable,
  type Writable,
  writable,
} from './atom.blueprint.js'

function familyUnsupported(): boolean {
  const flags = [
    typeof WeakRef === 'undefined',
    typeof FinalizationRegistry === 'undefined',
  ]
  return flags.includes(true)
}

function makeFamily(): <Arg, T extends object>(f: (arg: Arg) => T) => (arg: Arg) => T {
  if (familyUnsupported()) {
    return familyStrong
  }
  return familyWeak
}

function familyStrong<Arg, T extends object>(f: (arg: Arg) => T): (arg: Arg) => T {
  const atoms = MutableHashMap.empty<Arg, T>()
  return function(arg) {
    return familyStrongGet(atoms, arg, f)
  }
}

function familyStrongGet<Arg, T extends object>(
  atoms: MutableHashMap.MutableHashMap<Arg, T>,
  arg: Arg,
  f: (arg: Arg) => T,
): T {
  const atomEntry = MutableHashMap.get(atoms, arg)
  if (Option.isSome(atomEntry)) {
    return atomEntry.value
  }
  const newAtom = f(arg)
  MutableHashMap.set(atoms, arg, newAtom)
  return newAtom
}

function familyWeak<Arg, T extends object>(f: (arg: Arg) => T): (arg: Arg) => T {
  const atoms = MutableHashMap.empty<Arg, WeakRef<T>>()
  const registry = new FinalizationRegistry<Arg>((arg) => {
    MutableHashMap.remove(atoms, arg)
  })
  return function(arg) {
    return familyWeakGet(atoms, registry, arg, f)
  }
}

function familyWeakGet<Arg, T extends object>(
  atoms: MutableHashMap.MutableHashMap<Arg, WeakRef<T>>,
  registry: FinalizationRegistry<Arg>,
  arg: Arg,
  f: (arg: Arg) => T,
): T {
  const atomEntry = MutableHashMap.get(atoms, arg).pipe(
    Option.flatMapNullishOr((ref) => ref.deref()),
  )
  if (Option.isSome(atomEntry)) {
    return atomEntry.value
  }
  const newAtom = f(arg)
  MutableHashMap.set(atoms, arg, new WeakRef(newAtom))
  registry.register(newAtom, arg)
  return newAtom
}

function readWithFallback<A2, E2>(
  get: AtomContext,
  self: Atom<AnyResult>,
  fallback: Atom<AsyncResult.Result<A2, E2>>,
): AnyResult | AsyncResult.Result<A2, E2> {
  const result = get(self)
  if (AsyncResult.isInitial(result)) {
    return AsyncResult.waiting(get(fallback))
  }
  return result
}

function copyWithFallback<R extends Atom<AnyResult>, A2, E2>(
  self: R,
  withFallback: (get: AtomContext) => AnyResult | AsyncResult.Result<A2, E2>,
): Atom<AnyResult | AsyncResult.Result<A2, E2>> {
  const refresh = atomRefresh(self)
  if (isWritable(self)) {
    return writable(withFallback, self.write, refresh)
  }
  return readable(withFallback, refresh)
}

function atomRefresh<A>(self: Atom<A>): (refresh: <B>(atom: Atom<B>) => void) => void {
  const refresh = self.spec.refresh
  if (refresh === undefined) {
    return function(refresh) {
      refresh(self)
    }
  }
  return refresh
}

function mapResultValue(
  value: Top,
  f: (value: Top) => Top,
): AnyResult {
  if (AsyncResult.isResult(value) === false) {
    throw new TypeError('mapResult: expected an AsyncResult atom')
  }
  return mapResultMapped(value, f)
}

function mapResultMapped(
  value: AnyResult,
  f: (value: Top) => Top,
): AnyResult {
  if (AsyncResult.isSuccess(value)) {
    return AsyncResult.success(f(value.value))
  }
  return value
}

function mapResultBinary(selfOrF: Top, f: Top): Top {
  if (isAtom(selfOrF) === false) {
    throw new TypeError('mapResult expects an atom and a function argument')
  }
  return mapResultBinaryFn(selfOrF, f)
}

function mapResultBinaryFn(self: AnyAtom, f: Top): Top {
  if (isMapResultMapper(f) === false) {
    throw new TypeError('mapResult expects an atom and a function argument')
  }
  return mapResultImpl(self, f)
}

function mapResultCurried(selfOrF: Top): (self: AnyAtom) => Top {
  return (self: AnyAtom) => mapResultCurriedApply(self, selfOrF)
}

function mapResultCurriedApply(self: AnyAtom, selfOrF: Top): Top {
  if (isMapResultMapper(selfOrF) === false) {
    throw new TypeError('mapResult expects a function argument')
  }
  return mapResultImpl(self, selfOrF)
}

type SwrOptions = {
  readonly staleTime: Duration.Input
  readonly revalidateOnMount?: boolean | undefined
  readonly revalidateOnFocus?: boolean | 'always' | undefined
  readonly focusSignal?: AnyAtom | undefined
}

function revalidateOnFocusEnabled(value: boolean | 'always' | undefined): boolean {
  if (value === undefined) {
    return false
  }
  return value !== false
}

function shouldSubscribeSwrFocus(options: SwrOptions): options is SwrOptions & { readonly focusSignal: AnyAtom } {
  if (options.focusSignal === undefined) {
    return false
  }
  return revalidateOnFocusEnabled(options.revalidateOnFocus)
}

function swrFocusListener<A, E>(
  get: AtomContext,
  self: Atom<AsyncResult.Result<A, E>>,
  options: SwrOptions,
  staleTime: number,
): () => void {
  if (options.revalidateOnFocus === 'always') {
    return () => get.refresh(self)
  }
  return () => revalidateSwrIfStale(get, self, staleTime)
}

function revalidateSwrIfStale<A, E>(
  get: AtomContext,
  self: Atom<AsyncResult.Result<A, E>>,
  staleTime: number,
): void {
  const current = get.once(self)
  if (shouldRevalidateSWR(current, staleTime, get.registry.now())) {
    get.refresh(self)
  }
}

function subscribeSwrFocus<A, E>(
  get: AtomContext,
  self: Atom<AsyncResult.Result<A, E>>,
  options: SwrOptions,
  staleTime: number,
): void {
  if (shouldSubscribeSwrFocus(options) === false) {
    return
  }
  get.once(options.focusSignal)
  get.subscribe(options.focusSignal, swrFocusListener(get, self, options, staleTime))
}

function skipSwrRevalidateOnMount(options: SwrOptions, firstRead: boolean): boolean {
  if (firstRead === false) {
    return false
  }
  return options.revalidateOnMount === false
}

function readSwr<A, E>(
  get: AtomContext,
  self: Atom<AsyncResult.Result<A, E>>,
  options: SwrOptions,
  staleTime: number,
): AsyncResult.Result<A, E> {
  const current = get.once(self)
  get.subscribe(self, (value) => {
    get.setSelf(value)
  })
  subscribeSwrFocus(get, self, options, staleTime)
  return finishSwrRead(get, self, options, staleTime, current)
}

function finishSwrRead<A, E>(
  get: AtomContext,
  self: Atom<AsyncResult.Result<A, E>>,
  options: SwrOptions,
  staleTime: number,
  current: AsyncResult.Result<A, E>,
): AsyncResult.Result<A, E> {
  if (skipSwrRevalidateOnMount(options, Option.isNone(get.self()))) {
    return current
  }
  revalidateSwrIfStale(get, self, staleTime)
  return current
}

function swrFailureTimestamp<A, E>(result: AsyncResult.Result<A, E>): Option.Option<number> {
  if (AsyncResult.isFailure(result)) {
    return Option.map(result.previousSuccess, (success) => success.timestamp)
  }
  return Option.none()
}

function shouldRevalidateSettledSWR<A, E>(
  result: AsyncResult.Result<A, E>,
  staleTime: number,
  now: number,
): boolean {
  const timestamp = result.pipe(swrTimestamp, Option.getOrUndefined)
  if (timestamp === undefined) {
    return result.pipe(AsyncResult.isInitial) === false
  }
  return isFreshWithin(timestamp, staleTime, now) === false
}

type OptimisticState<A> = {
  lastValue: A
  needsRefresh: boolean
  transitions: Set<Atom<AsyncResult.Result<A, Top>>>
  cancels: Set<() => void>
}

function readOptimistic<A>(
  get: AtomContext,
  self: Atom<A>,
  writeAtom: Atom<readonly [number, Atom<AsyncResult.Result<A, Top>> | undefined]>,
): A {
  const state: OptimisticState<A> = {
    lastValue: get.once(self),
    needsRefresh: false,
    transitions: new Set(),
    cancels: new Set(),
  }
  get.subscribe(self, (value) => applyOptimisticSource(get, state, value))
  get.subscribe(writeAtom, ([, atom]) => subscribeOptimisticWrite(get, self, state, atom))
  get.addFinalizer(() => finalizeOptimistic(state))
  return state.lastValue
}

function applyOptimisticSource<A>(get: AtomContext, state: OptimisticState<A>, value: A): void {
  state.lastValue = value
  if (state.transitions.size > 0) {
    return
  }
  applyOptimisticSourceIdle(get, state, value)
}

function applyOptimisticSourceIdle<A>(get: AtomContext, state: OptimisticState<A>, value: A): void {
  state.needsRefresh = false
  if (AsyncResult.isAsyncResult(value) === false) {
    get.setSelf(value)
    return
  }
  applyOptimisticResult(get, value)
}

function applyOptimisticResult<A>(get: AtomContext, value: AsyncResult.Result<A, Top>): void {
  const current = Option.getOrUndefined(get.self())
  if (AsyncResult.isInitial(value)) {
    applyOptimisticInitial(get, current, value)
    return
  }
  applyOptimisticNonInitial(get, current, value)
}

function applyOptimisticInitial<A>(
  get: AtomContext,
  current: Top,
  value: AsyncResult.Initial<A, Top>,
): void {
  if (isInitialResult(current) === false) {
    return
  }
  get.setSelf(value)
}

function isInitialResult(current: Top): boolean {
  if (AsyncResult.isResult(current) === false) {
    return false
  }
  return AsyncResult.isInitial(current)
}

function applyOptimisticNonInitial<A>(
  get: AtomContext,
  current: Top,
  value: AsyncResult.Success<A, Top> | AsyncResult.Failure<A, Top>,
): void {
  if (AsyncResult.isSuccess(value)) {
    applyOptimisticSuccess(get, current, value)
    return
  }
  get.setSelf(value)
}

function applyOptimisticSuccess<A>(
  get: AtomContext,
  current: Top,
  value: AsyncResult.Success<A, Top>,
): void {
  if (isSuccessResult(current)) {
    applyOptimisticNewerSuccess(get, current, value)
    return
  }
  get.setSelf(value)
}

function isSuccessResult(current: unknown): current is AsyncResult.Success<Top, Top> {
  if (AsyncResult.isResult(current) === false) {
    return false
  }
  return AsyncResult.isSuccess(current)
}

function applyOptimisticNewerSuccess<A>(
  get: AtomContext,
  current: AsyncResult.Success<Top, Top>,
  value: AsyncResult.Success<A, Top>,
): void {
  if (shouldReplaceOptimisticSuccess(current, value) === false) {
    return
  }
  get.setSelf(value)
}

function shouldReplaceOptimisticSuccess(
  current: AsyncResult.Success<Top, Top>,
  value: AsyncResult.Success<Top, Top>,
): boolean {
  if (value.waiting) {
    return false
  }
  return value.timestamp >= current.timestamp
}

function subscribeOptimisticWrite<A>(
  get: AtomContext,
  self: Atom<A>,
  state: OptimisticState<A>,
  atom: Atom<AsyncResult.Result<A, Top>> | undefined,
): void {
  if (atom === undefined) {
    return
  }
  subscribeOptimisticWriteAtom(get, self, state, atom)
}

function subscribeOptimisticWriteAtom<A>(
  get: AtomContext,
  self: Atom<A>,
  state: OptimisticState<A>,
  atom: Atom<AsyncResult.Result<A, Top>>,
): void {
  if (state.transitions.has(atom)) {
    return
  }
  startOptimisticTransition(get, self, state, atom)
}

function startOptimisticTransition<A>(
  get: AtomContext,
  self: Atom<A>,
  state: OptimisticState<A>,
  atom: Atom<AsyncResult.Result<A, Top>>,
): void {
  state.transitions.add(atom)
  let cancel: (() => void) | undefined = undefined
  cancel = get.registry.subscribe(atom, (result) => {
    onOptimisticTransition(get, self, state, atom, cancel, result)
  }, { immediate: true })
  keepOptimisticCancel(state, atom, cancel)
}

function keepOptimisticCancel<A>(
  state: OptimisticState<A>,
  atom: Atom<AsyncResult.Result<A, Top>>,
  cancel: () => void,
): void {
  if (state.transitions.has(atom)) {
    state.cancels.add(cancel)
    return
  }
  cancel()
}

function onOptimisticTransition<A>(
  get: AtomContext,
  self: Atom<A>,
  state: OptimisticState<A>,
  atom: Atom<AsyncResult.Result<A, Top>>,
  cancel: (() => void) | undefined,
  result: AsyncResult.Result<A, Top>,
): void {
  if (isWaitingSuccess(result)) {
    get.setSelf(result.value)
    return
  }
  finishOptimisticTransition(get, self, state, atom, cancel, result)
}

function isWaitingSuccess<A, E>(result: AsyncResult.Result<A, E>): result is AsyncResult.Success<A, E> {
  if (AsyncResult.isSuccess(result) === false) {
    return false
  }
  return result.waiting
}

function finishOptimisticTransition<A>(
  get: AtomContext,
  self: Atom<A>,
  state: OptimisticState<A>,
  atom: Atom<AsyncResult.Result<A, Top>>,
  cancel: (() => void) | undefined,
  result: AsyncResult.Result<A, Top>,
): void {
  state.transitions.delete(atom)
  dropOptimisticCancel(state, cancel)
  markOptimisticRefresh(state, result)
  settleOptimisticTransitions(get, self, state)
}

function dropOptimisticCancel<A>(state: OptimisticState<A>, cancel: (() => void) | undefined): void {
  if (cancel === undefined) {
    return
  }
  state.cancels.delete(cancel)
  cancel()
}

function markOptimisticRefresh<A>(state: OptimisticState<A>, result: AsyncResult.Result<A, Top>): void {
  if (shouldMarkOptimisticRefresh(state, result) === false) {
    return
  }
  state.needsRefresh = true
}

function shouldMarkOptimisticRefresh<A>(state: OptimisticState<A>, result: AsyncResult.Result<A, Top>): boolean {
  if (state.needsRefresh) {
    return false
  }
  return AsyncResult.isFailure(result) === false
}

function settleOptimisticTransitions<A>(get: AtomContext, self: Atom<A>, state: OptimisticState<A>): void {
  if (state.transitions.size !== 0) {
    return
  }
  settleOptimisticIdle(get, self, state)
}

function settleOptimisticIdle<A>(get: AtomContext, self: Atom<A>, state: OptimisticState<A>): void {
  if (state.needsRefresh) {
    state.needsRefresh = false
    get.refresh(self)
    return
  }
  get.setSelf(state.lastValue)
}

function finalizeOptimistic<A>(state: OptimisticState<A>): void {
  for (const cancel of state.cancels) cancel()
  state.transitions.clear()
  state.cancels.clear()
}

function runOptimisticFn<A, W, XA, XE, OW>(
  self: Writable<A, Atom<AsyncResult.Result<W, Top>>>,
  options: {
    readonly reducer: (current: NoInfer<A>, update: OW) => NoInfer<W>
    readonly fn: AtomResultFn<OW, XA, XE> | ((set: (result: NoInfer<W>) => void) => AtomResultFn<OW, XA, XE>)
  },
  transition: Writable<AsyncResult.Result<W, Top>>,
  arg: OW,
  get: FnContext,
): Effect.Effect<XA, XE> {
  const value = optimisticFnValue(options.reducer(get(self), arg))
  get.set(transition, AsyncResult.successWith(value, { waiting: true }))
  get.set(self, transition)
  const fnAtom = optimisticFnAtom(options.fn, transition, get)
  get.set(fnAtom, arg)
  return Effect.callback<XA, XE>((resume) => {
    get.subscribe(fnAtom, (result) => {
      if (optimisticFnPending(result)) {
        return
      }
      get.set(transition, AsyncResult.map(result, () => value))
      resumeOptimisticFn(resume, result)
    }, { immediate: true })
  })
}

function optimisticFnValue<W>(value: W): W {
  if (AsyncResult.isAsyncResult(value) === false) {
    return value
  }
  return AsyncResult.waiting(value, { touch: true })
}

function optimisticFnAtom<W, XA, XE, OW>(
  fn: AtomResultFn<OW, XA, XE> | ((set: (result: NoInfer<W>) => void) => AtomResultFn<OW, XA, XE>),
  transition: Writable<AsyncResult.Result<W, Top>>,
  get: FnContext,
): AtomResultFn<OW, XA, XE> {
  if (typeof fn === 'function') {
    return autoDispose(fn((value) => setOptimisticFnTransition(get, transition, value)))
  }
  return fn
}

function setOptimisticFnTransition<W>(
  get: FnContext,
  transition: Writable<AsyncResult.Result<W, Top>>,
  value: W,
): void {
  get.set(transition, AsyncResult.successWith(waitingIfResult(value), { waiting: true }))
}

function waitingIfResult<W>(value: W): W {
  if (AsyncResult.isAsyncResult(value) === false) {
    return value
  }
  return AsyncResult.waiting(value)
}

function resumeOptimisticFn<XA, XE>(
  resume: (effect: Effect.Effect<XA, XE>) => void,
  result: AsyncResult.Result<XA, XE>,
): void {
  if (AsyncResult.isSuccess(result)) {
    resume(Effect.succeed(result.value))
    return
  }
  resumeOptimisticFailure(resume, result)
}

function resumeOptimisticFailure<XA, XE>(
  resume: (effect: Effect.Effect<XA, XE>) => void,
  result: AsyncResult.Result<XA, XE>,
): void {
  if (AsyncResult.isFailure(result) === false) {
    return
  }
  resume(Effect.failCause(result.cause))
}

function optimisticFnPending<A, E>(result: AsyncResult.Result<A, E>): boolean {
  if (AsyncResult.isInitial(result)) {
    return true
  }
  return result.waiting
}

/**
 * Creates a memoized atom factory that returns the same object for the same argument, using weak references for cached values when the platform supports them.
 *
 * @since 4.0.0
 */
export const family = makeFamily()

/**
 * Uses a fallback `AsyncResult` atom while the primary atom is `Initial`, marking the fallback result as waiting until the primary atom produces a non-initial result.
 *
 * @since 4.0.0
 */
export const withFallback: {
  <E2, A2>(
    fallback: Atom<AsyncResult.Result<A2, E2>>,
  ): <R extends Atom<AsyncResult.Result<Top, Top>>>(
    self: R,
  ) => With<R, AsyncResult.Result<Top, Top> | AsyncResult.Result<A2, E2>>
  <R extends Atom<AsyncResult.Result<Top, Top>>, A2, E2>(
    self: R,
    fallback: Atom<AsyncResult.Result<A2, E2>>,
  ): With<R, AsyncResult.Result<Top, Top> | AsyncResult.Result<A2, E2>>
} = dual(2, <R extends Atom<AsyncResult.Result<Top, Top>>, A2, E2>(
  self: R,
  fallback: Atom<AsyncResult.Result<A2, E2>>,
): Atom<
  AsyncResult.Result<Top, Top> | AsyncResult.Result<A2, E2>
> => {
  function withFallback(get: AtomContext): AsyncResult.Result<Top, Top> | AsyncResult.Result<A2, E2> {
    return readWithFallback(get, self, fallback)
  }
  return copyWithFallback(self, withFallback)
})

/**
 * Pairs an atom with an initial value for registry initialization.
 *
 * **When to use**
 *
 * Use to preload an atom value when constructing or seeding a registry.
 *
 * **Details**
 *
 * The returned tuple can be supplied to registry initial values so the atom
 * starts with the provided value before it is first rebuilt.
 *
 * @since 4.0.0
 */
export const initialValue: {
  <A>(initialValue: A): (self: Atom<A>) => readonly [Atom<A>, A]
  <A>(self: Atom<A>, initialValue: A): readonly [Atom<A>, A]
} = dual<
  <A>(initialValue: A) => (self: Atom<A>) => readonly [Atom<A>, A],
  <A>(self: Atom<A>, initialValue: A) => readonly [Atom<A>, A]
>(2, (self, initialValue) => [self, initialValue])

/**
 * Maps the value of an atom by reading the source atom, applying the function,
 *
 * **Details**
 *
 * When the source atom is writable, the returned atom remains writable and keeps
 * the source atom's write input type.
 *
 * @since 4.0.0
 */
export const map: {
  <R extends Atom<Top>, B>(
    f: (_: Type<R>) => B,
  ): (self: R) => With<R, B>
  <R extends Atom<Top>, B>(
    self: R,
    f: (_: Type<R>) => B,
  ): With<R, B>
} = dual(
  2,
  <A, B>(self: Atom<A>, f: (_: A) => B): Atom<B> => transform(self, (get) => f(get(self))),
)

/**
 * Maps the successful value inside an `AsyncResult` atom.
 *
 * **Details**
 *
 * Initial and failure states are preserved, and writable source atoms keep their
 * original write input type.
 *
 * @since 4.0.0
 */
const mapResultImpl = (
  self: Atom<Top>,
  f: (value: Top) => Top,
): Atom<AsyncResult.Result<Top, Top>> =>
  transform(self, (get): AsyncResult.Result<Top, Top> => mapResultValue(get(self), f))

type MapResultMapper = (s: Top) => Top
const isMapResultMapper = (arg: unknown): arg is MapResultMapper => typeof arg === 'function'

export function mapResult<R extends Atom<AsyncResult.Result<Top, Top>>, B>(
  f: (_: AsyncResult.Result.Success<Type<R>>) => B,
): (
  self: R,
) => With<R, AsyncResult.Result<B, AsyncResult.Result.Failure<Type<R>>>>
export function mapResult<R extends Atom<AsyncResult.Result<Top, Top>>, B>(
  self: R,
  f: (_: AsyncResult.Result.Success<Type<R>>) => B,
): With<R, AsyncResult.Result<B, AsyncResult.Result.Failure<Type<R>>>>
export function mapResult(
  selfOrF: Top,
  f?: Top,
): Top {
  if (arguments.length >= 2) {
    return mapResultBinary(selfOrF, f)
  }
  return mapResultCurried(selfOrF)
}

/**
 * Creates an atom that publishes source changes only after the source has stopped
 * changing for the specified duration.
 *
 * **Details**
 *
 * The current source value is used immediately, and any pending debounce timer is
 * cleared when the derived atom is disposed.
 *
 * @since 4.0.0
 */
export const debounce: {
  (duration: Duration.Input): <A extends Atom<Top>>(self: A) => WithoutSerializable<A>
  <A extends Atom<Top>>(self: A, duration: Duration.Input): WithoutSerializable<A>
} = dual(
  2,
  <A>(self: Atom<A>, duration: Duration.Input): Atom<A> => {
    const millis = Duration.toMillis(Duration.fromInputUnsafe(duration))
    return transform(self, function(get) {
      let timeout: (() => void) | undefined
      let value = get.once(self)
      function update() {
        timeout = undefined
        get.setSelf(value)
      }
      get.addFinalizer(function() {
        if (timeout !== undefined) timeout()
      })
      get.subscribe(self, function(val) {
        value = val
        timeout?.()
        timeout = get.registry.scheduleTimer(update, millis)
      })
      return value
    }, { initialValueTarget: self })
  },
)

/**
 * Creates a derived atom that reads the source and schedules a refresh after the
 * specified duration.
 *
 * **Details**
 *
 * The scheduled refresh is canceled when the derived atom's lifetime is disposed.
 *
 * @since 4.0.0
 */
export const withRefresh: {
  (duration: Duration.Input): <A extends Atom<Top>>(self: A) => WithoutSerializable<A>
  <A extends Atom<Top>>(self: A, duration: Duration.Input): WithoutSerializable<A>
} = dual(
  2,
  <A>(self: Atom<A>, duration: Duration.Input): Atom<A> => {
    const millis = Duration.toMillis(Duration.fromInputUnsafe(duration))
    return transform(self, function(get) {
      const fiber = Effect.runFork(Effect.sleep(millis).pipe(Effect.andThen(Effect.sync(() => get.refresh(self)))))
      get.addFinalizer(() => fiber.interruptUnsafe())
      return get(self)
    }, { initialValueTarget: self })
  },
)

/**
 * Adds stale-while-revalidate refresh behavior to an async result atom.
 *
 * **Details**
 *
 * Automatic revalidation during reads is skipped while the current value is
 * fresh within `staleTime`. Manual `refresh` calls remain forceful and always
 * forward to the wrapped atom. Use `revalidateOnMount` to control whether stale data should trigger a
 * background refresh on first mount. Use `revalidateOnFocus` to control
 * focus behavior. `true` respects `staleTime` and `"always"` forces refetch.
 *
 * @since 4.0.0
 */
export const swr: {
  (
    options: {
      readonly staleTime: Duration.Input
      readonly revalidateOnMount?: boolean | undefined
      readonly revalidateOnFocus?: boolean | 'always' | undefined
      readonly focusSignal?: Atom<Top> | undefined
    },
  ): <R extends Atom<AsyncResult.Result<Top, Top>>>(self: R) => WithoutSerializable<R>
  <R extends Atom<AsyncResult.Result<Top, Top>>>(
    self: R,
    options: {
      readonly staleTime: Duration.Input
      readonly revalidateOnMount?: boolean | undefined
      readonly revalidateOnFocus?: boolean | 'always' | undefined
      readonly focusSignal?: Atom<Top> | undefined
    },
  ): WithoutSerializable<R>
} = dual(
  2,
  <A, E>(
    self: Atom<AsyncResult.Result<A, E>>,
    options: {
      readonly staleTime: Duration.Input
      readonly revalidateOnMount?: boolean | undefined
      readonly revalidateOnFocus?: boolean | 'always' | undefined
      readonly focusSignal?: Atom<Top> | undefined
    },
  ): Atom<AsyncResult.Result<A, E>> => {
    const staleTime = Duration.toMillis(Duration.fromInputUnsafe(options.staleTime))
    return transform(self, (get) => readSwr(get, self, options, staleTime), { initialValueTarget: self })
  },
)

const swrTimestamp = <A, E>(result: AsyncResult.Result<A, E>): Option.Option<number> => {
  if (AsyncResult.isSuccess(result)) {
    return Option.some(result.timestamp)
  }
  return swrFailureTimestamp(result)
}

const isFreshWithin = (timestamp: number, staleTime: number, now: number): boolean => now - timestamp < staleTime

const shouldRevalidateSWR = <A, E>(
  result: AsyncResult.Result<A, E>,
  staleTime: number,
  now: number,
): boolean => {
  if (result.waiting) {
    return false
  }
  return shouldRevalidateSettledSWR(result, staleTime, now)
}

/**
 * Wraps an atom in a writable optimistic atom.
 *
 * **Details**
 *
 * Writes accept transition atoms containing `AsyncResult` values. Waiting
 * successes are shown optimistically while transitions run; when successful
 * transitions finish, the source atom is refreshed, and failures roll the value
 * back to the latest source value.
 *
 * @since 4.0.0
 */
export const optimistic = <A>(self: Atom<A>): Writable<A, Atom<AsyncResult.Result<A, Top>>> => {
  let counter = 0
  const writeAtom = setIdleTTL(
    state<readonly [number, Atom<AsyncResult.Result<A, Top>> | undefined]>(
      [counter, undefined] as const,
    ),
    0,
  )
  return writable(
    (get) => readOptimistic(get, self, writeAtom),
    (ctx, atom) => ctx.set(writeAtom, [++counter, atom]),
    (refresh) => refresh(self),
  )
}

/**
 * Creates an `AtomResultFn` that applies an optimistic update before running the
 * underlying mutation.
 *
 * **Details**
 *
 * The reducer computes the provisional value from the current value and mutation
 * input. The wrapped function result then completes the transition or updates the
 * optimistic value through the provided setter callback.
 *
 * @since 4.0.0
 */
export const optimisticFn: {
  <A, W, XA, XE, OW = void>(
    options: {
      readonly reducer: (current: NoInfer<A>, update: OW) => NoInfer<W>
      readonly fn:
        | AtomResultFn<OW, XA, XE>
        | ((set: (result: NoInfer<W>) => void) => AtomResultFn<OW, XA, XE>)
    },
  ): (
    self: Writable<A, Atom<AsyncResult.Result<W, Top>>>,
  ) => AtomResultFn<OW, XA, XE>
  <A, W, XA, XE, OW = void>(
    self: Writable<A, Atom<AsyncResult.Result<W, Top>>>,
    options: {
      readonly reducer: (current: NoInfer<A>, update: OW) => NoInfer<W>
      readonly fn:
        | AtomResultFn<OW, XA, XE>
        | ((set: (result: NoInfer<W>) => void) => AtomResultFn<OW, XA, XE>)
    },
  ): AtomResultFn<OW, XA, XE>
} = dual(2, <A, W, XA, XE, OW = void>(
  self: Writable<A, Atom<AsyncResult.Result<W, Top>>>,
  options: {
    readonly reducer: (current: NoInfer<A>, update: OW) => NoInfer<W>
    readonly fn:
      | AtomResultFn<OW, XA, XE>
      | ((set: (result: NoInfer<W>) => void) => AtomResultFn<OW, XA, XE>)
  },
): AtomResultFn<OW, XA, XE> => {
  const transition = setIdleTTL(AsyncResult.initial<W, Top>().pipe(state<AsyncResult.Result<W, Top>>), 0)
  return fn((arg: OW, get) => runOptimisticFn(self, options, transition, arg, get))
})
