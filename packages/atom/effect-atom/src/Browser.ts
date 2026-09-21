/**
 * Browser-only `Atom` helpers.
 *
 * This module holds the parts of `Atom` that touch `window`, `history`, or
 * `document`: window focus tracking and URL search parameter atoms. All
 * exports are re-exported from `Atom` so consumers keep importing everything
 * from there.
 *
 * @since 4.0.0
 */
import * as Effect from 'effect/Effect'
import * as Exit from 'effect/Exit'
import * as Option from 'effect/Option'
import * as Schema from 'effect/Schema'
import type { Atom, Type, WithoutSerializable, Writable, WriteContext } from './Atom.js'
import { readable, transform, writable } from './AtomCore.js'

type AnyAtom<A = unknown> = Atom<A>
type StringCodec<Type = unknown, Encoded extends string = string> = Schema.ConstraintCodec<Type, Encoded>

// -----------------------------------------------------------------------------
// Focus
// -----------------------------------------------------------------------------

/**
 * Creates a browser-only signal atom that increments when the document becomes visible.
 *
 * **Details**
 *
 * It listens for `visibilitychange` events on `window` and removes the listener
 * when the atom is disposed.
 *
 * @since 4.0.0
 */
export const windowFocusSignal: Atom<number> = readable((get) => {
  let count = 0
  function update() {
    if (document.visibilityState === 'visible') {
      get.setSelf(++count)
    }
  }
  window.addEventListener('visibilitychange', update)
  get.addFinalizer(() => {
    window.removeEventListener('visibilitychange', update)
  })
  return count
})

/**
 * Creates a combinator that refreshes an atom whenever the supplied signal atom
 * changes.
 *
 * **Details**
 *
 * The derived atom also subscribes to the source atom so normal source updates are
 * forwarded to its own value.
 *
 * @since 4.0.0
 */
export const makeRefreshOnSignal = <S>(signal: Atom<S>) => {
  function refreshOnSignal<A extends AnyAtom>(self: A): WithoutSerializable<A>
  function refreshOnSignal<A extends AnyAtom, V extends Type<A>>(
    self: A & Atom<V>,
  ): [A & Atom<V>] extends [Writable<infer _, infer RW>] ? Writable<V, RW> : Atom<V> {
    return transform(self, (get) => {
      get.once(signal)
      get.subscribe(signal, () => get.refresh(self))
      get.subscribe(self, (value: V) => get.setSelf(value))
      return get.once(self)
    }, { initialValueTarget: self })
  }
  return refreshOnSignal
}

/**
 * Refreshes an atom whenever `windowFocusSignal` changes.
 *
 * **Details**
 *
 * This helper is browser-only because `windowFocusSignal` depends on `window` and
 * `document.visibilityState`.
 *
 * @since 4.0.0
 */
export const refreshOnWindowFocus: <A extends AnyAtom>(self: A) => WithoutSerializable<A> = makeRefreshOnSignal(
  windowFocusSignal,
)

// -----------------------------------------------------------------------------
// URL search params
// -----------------------------------------------------------------------------

/**
 * Creates an atom that reads and writes a URL search parameter.
 *
 * **Gotchas**
 *
 * If you pass a schema, it has to be synchronous and have no context.
 *
 * @since 4.0.0
 */
export function searchParam<S extends StringCodec = never>(
  name: string,
  options?: {
    readonly schema?: S | undefined
  },
): Writable<[S] extends [never] ? string : Option.Option<S['Type']>>
export function searchParam<S extends StringCodec = never>(
  name: string,
  options?: {
    readonly schema?: S | undefined
  },
): Writable<string | Option.Option<S['Type']> | S['Type'], string | Option.Option<S['Type']>> {
  type R = string | Option.Option<S['Type']> | S['Type']
  type W = string | Option.Option<S['Type']>
  const decode = schemaDecoder(options)
  const encode = schemaEncoder(options)
  return writable<R, W>(
    (get): R => {
      if (typeof window === 'undefined') {
        return readWithoutWindow()
      }
      return readWithWindow(get)
    },
    (ctx: WriteContext<R>, value: W) => {
      if (typeof window === 'undefined') {
        ctx.setSelf(value)
        return
      }
      writeWithWindow(ctx, value)
    },
  )

  function readWithoutWindow(): R {
    if (decode !== undefined) {
      return Option.none()
    }
    return ''
  }

  function readWithWindow(get: {
    readonly addFinalizer: (f: () => void) => void
    readonly setSelf: (value: R) => void
    readonly self: () => Option.Option<R>
  }): R {
    const handleUpdate = () => {
      if (searchParamState.updating === true) {
        return
      }
      applyWindowUpdate(get)
    }
    window.addEventListener('popstate', handleUpdate)
    window.addEventListener('pushstate', handleUpdate)
    get.addFinalizer(() => {
      window.removeEventListener('popstate', handleUpdate)
      window.removeEventListener('pushstate', handleUpdate)
    })
    const value = paramOrEmpty(new URLSearchParams(window.location.search).get(name))
    return decodeSearchValue(value)
  }

  function applyWindowUpdate(get: {
    readonly setSelf: (value: R) => void
    readonly self: () => Option.Option<R>
  }): void {
    const newValue = paramOrEmpty(new URLSearchParams(window.location.search).get(name))
    if (decode !== undefined) {
      get.setSelf(Exit.getSuccess(decode(newValue)))
      return
    }
    applyPlainWindowUpdate(get, newValue)
  }

  function applyPlainWindowUpdate(
    get: {
      readonly setSelf: (value: R) => void
      readonly self: () => Option.Option<R>
    },
    newValue: string,
  ): void {
    if (newValue !== Option.getOrUndefined(get.self())) {
      get.setSelf(newValue)
    }
  }

  function decodeSearchValue(value: string): R {
    if (decode !== undefined) {
      return Exit.getSuccess(decode(value))
    }
    return value
  }

  function writeWithWindow(ctx: WriteContext<R>, value: W): void {
    const encoder = encode
    if (encoder !== undefined) {
      writeEncoded(ctx, value, encoder)
    } else {
      writePlain(ctx, value)
    }
    scheduleSearchParamUpdate()
  }

  function writeEncoded(
    ctx: WriteContext<R>,
    value: W,
    encoder: NonNullable<typeof encode>,
  ): void {
    const encoded = Option.flatMap(
      optionValue(value),
      (v) => Exit.getSuccess(encoder(v)),
    )
    searchParamState.updates.set(name, Option.getOrElse(encoded, () => ''))
    if (Option.isOption(value)) {
      ctx.setSelf(Option.zipRight(encoded, value))
    }
  }

  function writePlain(ctx: WriteContext<R>, value: W): void {
    if (typeof value === 'string') {
      searchParamState.updates.set(name, value)
      ctx.setSelf(value)
    }
  }
}

const optionValue = <A>(value: A | Option.Option<A>): Option.Option<A> => {
  if (Option.isOption(value)) {
    return value
  }
  return Option.none()
}

const scheduleSearchParamUpdate = (): void => {
  const generation = ++searchParamState.generation
  Effect.runFork(
    Effect.sleep('500 millis').pipe(
      Effect.andThen(
        Effect.sync(() => {
          runScheduledSearchParamUpdate(generation)
        }),
      ),
    ),
  )
}

const runScheduledSearchParamUpdate = (generation: number): void => {
  if (searchParamState.generation === generation) {
    updateSearchParams()
  }
}

const schemaDecoder = <S extends StringCodec>(
  options?: {
    readonly schema?: S | undefined
  },
) => {
  if (options === undefined) {
    return undefined
  }
  return schemaCodec(options.schema, Schema.decodeExit)
}

const schemaEncoder = <S extends StringCodec>(
  options?: {
    readonly schema?: S | undefined
  },
) => {
  if (options === undefined) {
    return undefined
  }
  return schemaCodec(options.schema, Schema.encodeExit)
}

const schemaCodec = <S extends StringCodec, C>(
  schema: S | undefined,
  codec: (schema: S) => C,
): C | undefined => {
  if (schema === undefined) {
    return undefined
  }
  return codec(schema)
}

const paramOrEmpty = (value: string | null): string => {
  if (value === null) {
    return ''
  }
  return emptyToEmpty(value)
}

const emptyToEmpty = (value: string): string => {
  if (value === '') {
    return ''
  }
  return value
}

const searchParamState = {
  generation: 0,
  updates: new Map<string, string>(),
  updating: false,
}

function updateSearchParams() {
  searchParamState.updating = true
  const searchParams = new URLSearchParams(window.location.search)
  for (const [key, value] of searchParamState.updates.entries()) {
    applySearchParam(searchParams, key, value)
  }
  searchParamState.updates.clear()
  const newUrl = `${window.location.pathname}?${searchParams.toString()}`
  window.history.pushState({}, '', newUrl)
  searchParamState.updating = false
}

const applySearchParam = (searchParams: URLSearchParams, key: string, value: string): void => {
  if (value.length > 0) {
    searchParams.set(key, value)
    return
  }
  searchParams.delete(key)
}
