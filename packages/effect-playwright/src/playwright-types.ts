import type { ElementHandle, JSHandle } from 'playwright-core'

/**
 * Recursively excludes Playwright handles from an argument shape.
 *
 * Adapted from Playwright's evaluation types.
 */
export type NoHandles<Arg> = Arg extends JSHandle ? never
  : Arg extends (...args: infer T) => PromiseLike<infer U> ? (...args: T) => Promise<NoHandles<U>>
  : Arg extends (...args: infer T) => infer R ? (...args: T) => NoHandles<R>
  : Arg extends object ? { [Key in keyof Arg]: NoHandles<Arg[Key]> }
  : Arg

export type Unboxed<Arg> = Arg extends ElementHandle<infer T> ? T
  : Arg extends JSHandle<infer T> ? T
  : Arg extends (...args: infer T) => PromiseLike<infer U> ? (...args: T) => Promise<Unboxed<U>>
  : Arg extends (...args: infer T) => infer R ? (...args: T) => Unboxed<R>
  : Arg extends NoHandles<Arg> ? Arg
  : Arg extends [infer A0] ? [Unboxed<A0>]
  : Arg extends [infer A0, infer A1] ? [Unboxed<A0>, Unboxed<A1>]
  : Arg extends [infer A0, infer A1, infer A2] ? [Unboxed<A0>, Unboxed<A1>, Unboxed<A2>]
  : Arg extends [infer A0, infer A1, infer A2, infer A3] ? [Unboxed<A0>, Unboxed<A1>, Unboxed<A2>, Unboxed<A3>]
  : Arg extends Array<infer T> ? Array<Unboxed<T>>
  : Arg extends object ? { [Key in keyof Arg]: Unboxed<Arg[Key]> }
  : Arg

export type PageFunction<Arg, R> =
  | string
  | ((arg: Unboxed<Arg>) => R | Promise<R>)

/**
 * A type helper to patch the `on`, `off`, and `once` methods of a Playwright object
 * to support a specific set of events with correctly typed listeners.
 *
 * This is useful because Playwright's event methods are often overloaded,
 * making them difficult to use in generic contexts or with custom event maps.
 */
export type PatchedEvents<Original, Events> = Original & {
  on<K extends keyof Events>(
    event: K,
    listener: (arg: Events[K]) => void,
  ): PatchedEvents<Original, Events>
  off<K extends keyof Events>(
    event: K,
    listener: (arg: Events[K]) => void,
  ): PatchedEvents<Original, Events>
  once<K extends keyof Events>(
    event: K,
    listener: (arg: Events[K]) => void,
  ): PatchedEvents<Original, Events>
}

/**
 * Presents a Playwright object through the {@link PatchedEvents} view so its
 * overloaded `on`, `off`, and `once` methods can be addressed by a generic
 * event key.
 */
export const patchedEvents = <Target, Events>(
  target: Target,
): PatchedEvents<Target, Events> =>
  // oxlint-disable-next-line typescript/consistent-type-assertions -- playwright-core's on/off/once are overloaded per event name and cannot be addressed by a generic event key without a structural view of the third-party object
  target as PatchedEvents<Target, Events>
