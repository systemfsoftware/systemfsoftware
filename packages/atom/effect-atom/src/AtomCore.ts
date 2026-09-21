import * as Duration from 'effect/Duration'
import { dual } from 'effect/Function'
import { type Inspectable, NodeInspectSymbol } from 'effect/Inspectable'
import { pipeArguments } from 'effect/Pipeable'
import { hasProperty } from 'effect/Predicate'
import type { Mutable } from 'effect/Types'
import type { Atom, AtomContext, Writable, WriteContext } from './Atom.js'

type AnyAtom<A = unknown> = Atom<A>
type AnyWritable<A = unknown, W = unknown> = Writable<A, W>

export const PipeInspectableProto = {
  pipe() {
    return pipeArguments(this, arguments)
  },
}

/**
 * Type-level identifier used to recognize `Atom` values.
 *
 * @since 4.0.0
 */
export type TypeId = '~effect/reactivity/Atom'

/**
 * Runtime identifier attached to `Atom` values and used by `isAtom`.
 *
 * @since 4.0.0
 */
export const TypeId: TypeId = '~effect/reactivity/Atom'

/**
 * Type-level identifier used to recognize writable atoms.
 *
 * @since 4.0.0
 */
export type WritableTypeId = '~effect/reactivity/Atom/Writable'

/**
 * Runtime identifier attached to writable atoms and used by `isWritable`.
 *
 * @since 4.0.0
 */
export const WritableTypeId: WritableTypeId = '~effect/reactivity/Atom/Writable'

/**
 * Returns `true` when a value is an `Atom`.
 *
 * @since 4.0.0
 */
export const isAtom = (u: unknown): u is AnyAtom => hasProperty(u, TypeId)

/**
 * Returns a copy of an atom with an idle time-to-live: finite durations dispose it after inactivity, while an infinite duration keeps it alive.
 *
 * @since 4.0.0
 */
export const setIdleTTL: {
  (duration: Duration.Input): <A extends AnyAtom>(self: A) => A
  <A extends AnyAtom>(self: A, duration: Duration.Input): A
} = dual<
  (duration: Duration.Input) => <A extends AnyAtom>(self: A) => A,
  <A extends AnyAtom>(self: A, duration: Duration.Input) => A
>(2, <A extends AnyAtom>(self: A, durationInput: Duration.Input): A => {
  const duration = Duration.fromInputUnsafe(durationInput)
  const isFinite = Duration.isFinite(duration)
  const copy = {
    ...self,
    keepAlive: !isFinite,
    idleTTL: idleTtlMillis(duration, isFinite),
  }
  Reflect.setPrototypeOf(copy, Reflect.getPrototypeOf(self))
  return copy
})

export const removeTtl = setIdleTTL(0)

export const AtomProto = {
  [TypeId]: TypeId,
  equals: Object.is,
  ...PipeInspectableProto,
  [NodeInspectSymbol](): Inspectable {
    return this
  },
  toJSON(this: AnyAtom) {
    return {
      _id: 'Atom',
      keepAlive: this.keepAlive,
      lazy: this.lazy,
      label: this.label,
    }
  },
} as const

export const WritableProto = {
  ...AtomProto,
  [WritableTypeId]: WritableTypeId,
} as const

/**
 * Returns `true` when an atom is writable.
 *
 * @since 4.0.0
 */
export const isWritable = <R, W>(atom: Atom<R>): atom is Writable<R, W> => WritableTypeId in atom

/**
 * Creates a read-only atom from a read function and an optional custom refresh registration callback.
 *
 * @since 4.0.0
 */
export const readable = <A>(
  read: (get: AtomContext) => A,
  refresh?: (f: <A>(atom: Atom<A>) => void) => void,
): Atom<A> => {
  const self: Atom<A> = {
    ...AtomProto,
    keepAlive: false,
    lazy: true,
    read,
    ...optionalRefresh(refresh),
  }
  return self
}

/**
 * Creates a writable atom from read and write functions, with an optional custom refresh registration callback.
 *
 * @since 4.0.0
 */
export const writable = <R, W>(
  read: (get: AtomContext) => R,
  write: (ctx: WriteContext<R>, value: W) => void,
  refresh?: (f: <A>(atom: Atom<A>) => void) => void,
): Writable<R, W> => {
  const self: Writable<R, W> = {
    ...WritableProto,
    keepAlive: false,
    lazy: true,
    read,
    write,
    ...optionalRefresh(refresh),
  }
  return self
}

const idleTtlMillis = (duration: Duration.Duration, isFinite: boolean): number | undefined => {
  if (isFinite) {
    return Duration.toMillis(duration)
  }
  return undefined
}

const optionalRefresh = (
  refresh?: (f: <A>(atom: Atom<A>) => void) => void,
): { readonly refresh: (f: <A>(atom: Atom<A>) => void) => void } | Record<string, never> => {
  if (refresh === undefined) {
    return {}
  }
  return { refresh }
}

const defaultRefresh = <A>(self: Atom<A>): (f: <B>(atom: Atom<B>) => void) => void => {
  if (self.refresh !== undefined) {
    return self.refresh
  }
  return function(refresh) {
    refresh(self)
  }
}

const transformReadable = <A, B>(
  self: Atom<A>,
  f: (get: AtomContext, atom: Atom<A>) => B,
): Atom<B> =>
  readable(
    (get) => f(get, self),
    defaultRefresh(self),
  )

const transformWritable = <A, B>(
  self: AnyWritable<A>,
  f: (get: AtomContext, atom: Atom<A>) => B,
): Atom<B> =>
  writable(
    (get) => f(get, self),
    function(ctx, value) {
      ctx.set(self, value)
    },
    defaultRefresh(self),
  )

const transformAtom = <A, B>(
  self: Atom<A>,
  f: (get: AtomContext, atom: Atom<A>) => B,
): Atom<B> => {
  if (isWritable(self)) {
    return transformWritable(self, f)
  }
  return transformReadable(self, f)
}

const applyInitialValueTarget = <B>(
  atom: Atom<B>,
  options?: {
    readonly initialValueTarget?: Atom<B> | undefined
  },
): void => {
  if (options === undefined) {
    return
  }
  assignInitialValueTarget(atom, options.initialValueTarget)
}

const assignInitialValueTarget = <B>(
  atom: Atom<B>,
  initialValueTarget: Atom<B> | undefined,
): void => {
  if (initialValueTarget === undefined) {
    return
  }
  const mutable: Mutable<Atom<B>> = atom
  mutable.initialValueTarget = getInitialValueTarget(initialValueTarget)
}

const getInitialValueTarget = <A>(atom: Atom<A>): Atom<A> => {
  let target = atom
  while (target.initialValueTarget != null) {
    target = target.initialValueTarget
  }
  return target
}

/**
 * Creates a derived atom by reading another atom with a custom `AtomContext`
 * function.
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
  <R extends AnyAtom, B>(
    f: (get: AtomContext, atom: R) => B,
    options?: {
      readonly initialValueTarget?: Atom<B> | undefined
    },
  ): (self: R) => [R] extends [Writable<infer _, infer RW>] ? Writable<B, RW> : Atom<B>
  <R extends AnyAtom, B>(
    self: R,
    f: (get: AtomContext, atom: R) => B,
    options?: {
      readonly initialValueTarget?: Atom<B> | undefined
    },
  ): [R] extends [Writable<infer _, infer RW>] ? Writable<B, RW> : Atom<B>
} = dual(
  (args) => isAtom(args[0]),
  <A, B>(
    self: Atom<A>,
    f: (get: AtomContext, atom: Atom<A>, options?: {
      readonly initialValueTarget?: Atom<B> | undefined
    }) => B,
    options?: {
      readonly initialValueTarget?: Atom<B> | undefined
    },
  ): Atom<B> => {
    const atom = removeTtl(transformAtom(self, f))
    applyInitialValueTarget(atom, options)
    return atom
  },
)
