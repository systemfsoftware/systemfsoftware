/**
 * React helpers for creating Atom instances that belong to one component
 * subtree. `make` returns a scoped atom — a cold blueprint whose targets are a
 * provider, a context, and a `use` accessor. Each provider creates its own
 * Atom once, so different subtrees can use the same scoped atom definition
 * without sharing state.
 *
 * @since 4.0.0
 */
'use client'

import { Blueprint } from '@systemfsoftware/effect-cell-types'
import { type Context, createContext, createElement, type FC, type ReactNode, useContext, useState } from 'react'
import { type AnyAtom } from './registry-context.js'

type Top<A = unknown> = A

/**
 * The identity every scoped atom carries.
 *
 * @since 4.0.0
 */
export const TypeId: unique symbol = Symbol.for('~@effect/atom-react/ScopedAtom')

/**
 * @since 4.0.0
 */
export type TypeId = typeof TypeId

/**
 * The type index of a scoped atom: the atom it hands back through `use` and the
 * input its factory accepts.
 *
 * @since 4.0.0
 */
export interface ScopedAtomIndex {
  readonly Atom: Top
  readonly Input: Top
}

type FieldOf<X, K extends keyof ScopedAtomIndex> = (X & ScopedAtomIndex)[K]

/**
 * The `use` accessor of a scoped atom: a hook returning the atom the nearest
 * provider created.
 *
 * @since 4.0.0
 */
export interface ScopedAtomUse extends Blueprint.Target {
  readonly target: () => FieldOf<this['Index'], 'Atom'>
}

type ProviderOf<X> = [FieldOf<X, 'Input'>] extends [never] ? FC<{ readonly children?: ReactNode | undefined }>
  : FC<{ readonly children?: ReactNode | undefined; readonly value: FieldOf<X, 'Input'> }>

/**
 * The provider component of a scoped atom, taking a `value` prop when the
 * factory expects input.
 *
 * @since 4.0.0
 */
export interface ScopedAtomProvider extends Blueprint.Target {
  readonly target: ProviderOf<this['Index']>
}

/**
 * The React context a scoped atom's provider writes the created atom into.
 *
 * @since 4.0.0
 */
export interface ScopedAtomContext extends Blueprint.Target {
  readonly target: Context<FieldOf<this['Index'], 'Atom'> | undefined>
}

/**
 * The operations and targets every scoped atom carries.
 *
 * @since 4.0.0
 */
export interface ScopedAtomOps {
  readonly use: ScopedAtomUse
  readonly Provider: ScopedAtomProvider
  readonly Context: ScopedAtomContext
}

/**
 * The cold description one scoped atom carries. The provider and context are
 * stored with their atom type erased; the `use`, `Provider`, and `Context`
 * targets read them back typed by the scoped atom.
 *
 * @since 4.0.0
 */
export interface ScopedAtomSpec {
  readonly factory: (() => AnyAtom) | ((input: never) => AnyAtom)
  readonly use: () => AnyAtom
  readonly Provider: Top
  readonly Context: Top
}

/**
 * Scoped Atom: a blueprint with a provider-backed instance.
 *
 * **Example** (Providing and reading a scoped atom)
 *
 * ```ts
 * import { Atom } from "@systemfsoftware/effect-atom"
 * import { make, useAtomValue } from "@systemfsoftware/effect-atom-react"
 * import { createElement } from "react"
 * import { renderToStaticMarkup } from "react-dom/server"
 *
 * const Counter = make(() => Atom.make(0))
 *
 * function View() {
 *   const atom = Counter.use()
 *   const value = useAtomValue(atom)
 *   return createElement("div", null, value)
 * }
 *
 * export function App() {
 *   return createElement(Counter.Provider, null, createElement(View))
 * }
 *
 * renderToStaticMarkup(createElement(App))
 * ```
 *
 * @since 4.0.0
 */
export type ScopedAtom<A extends AnyAtom, Input = never> = Blueprint.Blueprint<
  TypeId,
  ScopedAtomSpec,
  ScopedAtomOps,
  { readonly Atom: A; readonly Input: Input }
>

/**
 * A scoped atom with its atom type and factory input erased.
 *
 * @since 4.0.0
 */
export type AnyScopedAtom = ScopedAtom<AnyAtom, Top>

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

const ScopedAtoms = Blueprint.make<ScopedAtomSpec, ScopedAtomIndex>()(TypeId).operations<ScopedAtomOps>()({
  operations: {},
  targets: {
    use: (self: AnyScopedAtom) => self.spec.use,
    Provider: (self: AnyScopedAtom) => self.spec.Provider,
    Context: (self: AnyScopedAtom) => self.spec.Context,
  },
})

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
 * ```ts
 * import { Atom } from "@systemfsoftware/effect-atom"
 * import { make, useAtomValue } from "@systemfsoftware/effect-atom-react"
 * import { createElement } from "react"
 * import { renderToStaticMarkup } from "react-dom/server"
 *
 * const User = make((name: string) => Atom.make(name))
 *
 * function UserName() {
 *   const atom = User.use()
 *   const value = useAtomValue(atom)
 *   return createElement("span", null, value)
 * }
 *
 * export function App() {
 *   return createElement(
 *     User.Provider,
 *     { value: "Ada" },
 *     createElement(UserName)
 *   )
 * }
 *
 * renderToStaticMarkup(createElement(App))
 * ```
 *
 * @since 4.0.0
 */
export const make = <A extends AnyAtom, Input = never>(
  f: (() => A) | ((input: Input) => A),
): ScopedAtom<A, Input> => {
  const ScopeContext = createContext<A | undefined>(undefined)

  const use = (): A => {
    const atom = useContext(ScopeContext)
    if (atom === undefined) {
      throw new Error('ScopedAtom used outside of its Provider')
    }
    return atom
  }

  const Provider: FC<{ readonly children?: ReactNode | undefined; readonly value?: Input }> = (props) => {
    const [atom] = useState(() => createScopedAtom(f, props.value))
    return createElement(ScopeContext.Provider, { value: atom }, props.children)
  }

  return ScopedAtoms.of<{ readonly Atom: A; readonly Input: Input }>({
    factory: f,
    use,
    Provider,
    Context: ScopeContext,
  })
}
