import * as Effect from 'effect/Effect'
import { dual } from 'effect/Function'
import * as Scope from 'effect/Scope'
import * as Stream from 'effect/Stream'
import * as AsyncResult from './async-result.js'
import { isAtom } from './atom-core.resource.js'
import { type Atom, type Writable } from './atom.resource.js'
import { Current } from './current-registry.service.js'
import * as Registry from './registry.handle.js'

/**
 * Converts an atom into a stream using the `Current` service.
 *
 * **Details**
 *
 * The stream emits the atom's current value immediately and then emits subsequent
 * changes until the stream scope is closed.
 *
 * @since 4.0.0
 */
export const toStream = <A>(self: Atom<A>): Stream.Stream<A, never, Current> =>
  Stream.unwrap(Current.use((r) => Effect.succeed(Registry.toStream(r, self))))

/**
 * Converts an `AsyncResult` atom into a stream using the `Current` service.
 *
 * **Details**
 *
 * Initial results are skipped, successes are emitted as stream values, and
 * failures fail the stream with the result cause.
 *
 * @since 4.0.0
 */
export const toStreamResult = <A, E>(self: Atom<AsyncResult.Result<A, E>>): Stream.Stream<A, E, Current> =>
  Stream.unwrap(Current.use((r) => Effect.succeed(Registry.toStreamResult(r, self))))

/**
 * Reads an atom's current value from the `Current` service.
 *
 * @since 4.0.0
 */
export const get = <A>(self: Atom<A>): Effect.Effect<A, never, Current> =>
  Current.use((r) => Effect.succeed(Registry.get(r, self)))

/**
 * Reads a writable atom, computes a return value and next write value, writes the
 * next value, and returns the computed result.
 *
 * @since 4.0.0
 */
export const modify: {
  <R, W, A>(
    f: (_: R) => [A, W],
  ): (self: Writable<R, W>) => Effect.Effect<A, never, Current>
  <R, W, A>(self: Writable<R, W>, f: (_: R) => [A, W]): Effect.Effect<A, never, Current>
} = dual(
  2,
  <R, W, A>(self: Writable<R, W>, f: (_: R) => [returnValue: A, nextValue: W]): Effect.Effect<A, never, Current> =>
    Effect.map(Current, (r) => Registry.modify(r, self, f)),
)

/**
 * Writes a value to a writable atom through the `Current` service.
 *
 * @since 4.0.0
 */
export const set: {
  <W>(value: W): <R>(self: Writable<R, W>) => Effect.Effect<void, never, Current>
  <R, W>(self: Writable<R, W>, value: W): Effect.Effect<void, never, Current>
} = dual(
  2,
  <R, W>(self: Writable<R, W>, value: W): Effect.Effect<void, never, Current> =>
    Effect.map(Current, (r) => Registry.set(r, self, value)),
)

/**
 * Updates a writable atom by reading its current value from the registry and
 * writing the value returned by the update function.
 *
 * @since 4.0.0
 */
export const update: {
  <R, W>(f: (_: R) => W): (self: Writable<R, W>) => Effect.Effect<void, never, Current>
  <R, W>(self: Writable<R, W>, f: (_: R) => W): Effect.Effect<void, never, Current>
} = dual(
  2,
  <R, W>(self: Writable<R, W>, f: (_: R) => W): Effect.Effect<void, never, Current> =>
    Effect.map(Current, (r) => Registry.update(r, self, f)),
)

/**
 * Reads an `AsyncResult` atom as an effect through the `Current` service.
 *
 * **Details**
 *
 * The effect waits while the result is `Initial`, and also while it is waiting
 * when `suspendOnWaiting` is enabled. Successes succeed with the value and
 * failures fail with the result cause.
 *
 * @since 4.0.0
 */
export const getResult: {
  <A, E>(
    self: Atom<AsyncResult.Result<A, E>>,
    options?: { readonly suspendOnWaiting?: boolean | undefined },
  ): Effect.Effect<A, E, Current>
  <A, E>(
    options?: { readonly suspendOnWaiting?: boolean | undefined },
  ): (self: Atom<AsyncResult.Result<A, E>>) => Effect.Effect<A, E, Current>
} = dual(
  (args) => isAtom(args[0]),
  <A, E>(
    self: Atom<AsyncResult.Result<A, E>>,
    options?: { readonly suspendOnWaiting?: boolean | undefined },
  ): Effect.Effect<A, E, Current> => Current.use(Registry.getResult(self, options)),
)

/**
 * Runs a refresh request for an atom through the `Current` service.
 *
 * **When to use**
 *
 * Use to invalidate and recompute an atom from an Effect that has access to the
 * active registry.
 *
 * @since 4.0.0
 */
export const refresh = <A>(self: Atom<A>): Effect.Effect<void, never, Current> =>
  Effect.map(Current, (r) => Registry.refresh(r, self))

/**
 * Mounts an atom in the registry for the lifetime of the current scope.
 *
 * **Details**
 *
 * Mounting keeps the atom subscribed with a no-op listener until the scope
 * finalizer releases it.
 *
 * @since 4.0.0
 */
export const mount = <A>(self: Atom<A>): Effect.Effect<void, never, Current | Scope.Scope> =>
  Current.use((r) => Registry.mount(r, self))

// -----------------------------------------------------------------------------
// Serializable
// -----------------------------------------------------------------------------
