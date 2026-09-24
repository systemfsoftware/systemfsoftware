/**
 * React helpers for creating Atom instances that belong to one component
 * subtree. `make` returns a scoped atom with a provider, context, and `use`
 * accessor. Each provider creates its own Atom once, so different subtrees can
 * use the same scoped atom definition without sharing state.
 *
 * @since 4.0.0
 */
'use client'

import type { Atom } from '@systemfsoftware/effect-atom'
import * as React from 'react'

/**
 * Literal type used as the `ScopedAtom` type identifier.
 *
 * **Details**
 *
 * Used as the computed property key and marker value stored on `ScopedAtom`
 * objects.
 *
 * @since 4.0.0
 */
export type TypeId = '~@effect/atom-react/ScopedAtom'

/**
 * Type identifier for ScopedAtom.
 *
 * **Details**
 *
 * Used as the computed property key and marker value stored on `ScopedAtom`
 * objects.
 *
 * @since 4.0.0
 */
export const TypeId: TypeId = '~@effect/atom-react/ScopedAtom'

/**
 * Scoped Atom interface with a provider-backed instance.
 *
 * **Example** (Providing and reading a scoped atom)
 *
 * ```ts import.meta.vitest
 * import { make, useAtomValue } from "@effect/atom-react"
 * import { Atom } from "effect/unstable/reactivity"
 * import * as React from "react"
 * import { renderToStaticMarkup } from "react-dom/server"
 *
 * const Counter = make(() => Atom.make(0))
 *
 * function View() {
 *   const atom = Counter.use()
 *   const value = useAtomValue(atom)
 *   return React.createElement("div", null, value)
 * }
 *
 * export function App() {
 *   return React.createElement(Counter.Provider, null, React.createElement(View))
 * }
 *
 * renderToStaticMarkup(React.createElement(App)) // => "<div>0</div>"
 * ```
 *
 * @since 4.0.0
 */
type AnyAtom<Val = unknown> = Atom.Atom<Val>

export interface ScopedAtom<A extends AnyAtom, Input = never> {
  readonly [TypeId]: TypeId
  use(): A
  Provider: [Input] extends [never] ? React.FC<{ readonly children?: React.ReactNode | undefined }>
    : React.FC<{ readonly children?: React.ReactNode | undefined; readonly value: Input }>
  Context: React.Context<A | undefined>
}

function hasNoParameters<A extends AnyAtom, Input>(
  factory: (() => A) | ((input: Input) => A),
): factory is () => A {
  return factory.length === 0
}

function createScopedAtomFromInput<A extends AnyAtom, Input>(
  factory: (input: Input) => A,
  value: Input | undefined,
): A {
  if (value === undefined) {
    throw new Error('ScopedAtom Provider requires a value')
  }
  return factory(value)
}

function createScopedAtom<A extends AnyAtom, Input>(
  factory: (() => A) | ((input: Input) => A),
  value: Input | undefined,
): A {
  if (hasNoParameters(factory)) {
    return factory()
  }
  return createScopedAtomFromInput(factory, value)
}

/**
 * Creates a ScopedAtom from a factory function.
 *
 * **When to use**
 *
 * Use to create an atom instance that is owned by a React provider and scoped
 * to a component subtree.
 *
 * **Details**
 *
 * The returned scoped atom includes a `Provider`, `Context`, and `use`
 * accessor. The provider creates the atom once for its lifetime, passing the
 * `value` prop to the factory when the scoped atom expects input.
 *
 * **Gotchas**
 *
 * `use` must run under the matching provider. Changing the provider `value`
 * prop after mount does not recreate the atom.
 *
 * **Example** (Creating a scoped atom with input)
 *
 * ```ts import.meta.vitest
 * import { make, useAtomValue } from "@effect/atom-react"
 * import { Atom } from "effect/unstable/reactivity"
 * import * as React from "react"
 * import { renderToStaticMarkup } from "react-dom/server"
 *
 * const User = make((name: string) => Atom.make(name))
 *
 * function UserName() {
 *   const atom = User.use()
 *   const value = useAtomValue(atom)
 *   return React.createElement("span", null, value)
 * }
 *
 * export function App() {
 *   return React.createElement(
 *     User.Provider,
 *     { value: "Ada" },
 *     React.createElement(UserName)
 *   )
 * }
 *
 * renderToStaticMarkup(React.createElement(App)) // => "<span>Ada</span>"
 * ```
 *
 * @since 4.0.0
 */
export const make = <A extends AnyAtom, Input = never>(
  f: (() => A) | ((input: Input) => A),
): ScopedAtom<A, Input> => {
  const Context = React.createContext<A | undefined>(undefined)

  const use = (): A => {
    const atom = React.useContext(Context)
    if (atom === undefined) {
      throw new Error('ScopedAtom used outside of its Provider')
    }
    return atom
  }

  const Provider: React.FC<{ readonly children?: React.ReactNode | undefined; readonly value?: Input }> = (props) => {
    const atom = React.useRef<A | null>(null)
    if (atom.current === null) {
      atom.current = createScopedAtom(f, props.value)
    }
    return React.createElement(Context.Provider, { value: atom.current }, props.children)
  }

  return {
    [TypeId]: TypeId,
    use,
    Provider,
    Context,
  }
}
