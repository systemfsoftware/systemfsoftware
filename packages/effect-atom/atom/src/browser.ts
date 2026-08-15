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
import * as Exit from 'effect/Exit'
import * as Option from 'effect/Option'
import * as Schema from 'effect/Schema'
import type { Atom, Type, WithoutSerializable, Writable } from './Atom.js'
import { readable, transform, writable } from './internal/core.js'

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
 * @category constants
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
 * @category constructors
 * @since 4.0.0
 */
export const makeRefreshOnSignal = <_>(signal: Atom<_>) => {
  function refreshOnSignal<A extends Atom<any>>(self: A): WithoutSerializable<A>
  function refreshOnSignal<A extends Atom<any>>(self: A): Atom<Type<A>> | Writable<Type<A>, any> {
    return transform(self, (get) => {
      get.once(signal)
      get.subscribe(signal, (_) => get.refresh(self))
      get.subscribe(self, (value) => get.setSelf(value))
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
 * @category combinators
 * @since 4.0.0
 */
export const refreshOnWindowFocus: <A extends Atom<any>>(self: A) => WithoutSerializable<A> = makeRefreshOnSignal(
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
 * @category constructors
 * @since 4.0.0
 */
export function searchParam<S extends Schema.ConstraintCodec<any, string> = never>(
  name: string,
  options?: {
    readonly schema?: S | undefined
  },
): Writable<[S] extends [never] ? string : Option.Option<S['Type']>>
export function searchParam<S extends Schema.ConstraintCodec<any, string> = never>(
  name: string,
  options?: {
    readonly schema?: S | undefined
  },
): Writable<Option.Option<S['Type'] | undefined> | string, any> {
  const decode = options?.schema && Schema.decodeExit(options.schema)
  const encode = options?.schema && Schema.encodeExit(options.schema)
  return writable(
    (get) => {
      if (typeof window === 'undefined') {
        return decode ? Option.none() : ''
      }
      const handleUpdate = () => {
        if (searchParamState.updating) return
        const searchParams = new URLSearchParams(window.location.search)
        const newValue = searchParams.get(name) || ''
        if (decode) {
          get.setSelf(Exit.getSuccess(decode(newValue)))
        } else if (newValue !== Option.getOrUndefined(get.self())) {
          get.setSelf(newValue)
        }
      }
      window.addEventListener('popstate', handleUpdate)
      window.addEventListener('pushstate', handleUpdate)
      get.addFinalizer(() => {
        window.removeEventListener('popstate', handleUpdate)
        window.removeEventListener('pushstate', handleUpdate)
      })
      const value = new URLSearchParams(window.location.search).get(name) || ''
      return decode ? Exit.getSuccess(decode(value)) : value
    },
    (ctx, value: any) => {
      if (typeof window === 'undefined') {
        ctx.setSelf(value)
        return
      }

      if (encode) {
        const encoded = Option.flatMap(value, (v) => Exit.getSuccess(encode(v as S['Type'])))
        searchParamState.updates.set(name, Option.getOrElse(encoded, () => ''))
        value = Option.zipRight(encoded, value)
      } else {
        searchParamState.updates.set(name, value)
      }
      ctx.setSelf(value)
      if (searchParamState.timeout) {
        clearTimeout(searchParamState.timeout)
      }
      searchParamState.timeout = setTimeout(updateSearchParams, 500)
    },
  )
}

const searchParamState = {
  timeout: undefined as number | undefined,
  updates: new Map<string, string>(),
  updating: false,
}

function updateSearchParams() {
  searchParamState.timeout = undefined
  searchParamState.updating = true
  const searchParams = new URLSearchParams(window.location.search)
  for (const [key, value] of searchParamState.updates.entries()) {
    if (value.length > 0) {
      searchParams.set(key, value)
    } else {
      searchParams.delete(key)
    }
  }
  searchParamState.updates.clear()
  const newUrl = `${window.location.pathname}?${searchParams.toString()}`
  window.history.pushState({}, '', newUrl)
  searchParamState.updating = false
}
