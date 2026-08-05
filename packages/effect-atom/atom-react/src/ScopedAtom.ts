/**
 * @since 1.0.0
 */
'use client'
import type * as Atom from '@systemfsoftware/effect-atom/Atom'
import * as React from 'react'

/**
 * @since 1.0.0
 * @category Type IDs
 */
export type TypeId = '~@systemfsoftware/effect-atom-react/ScopedAtom'

/**
 * @since 1.0.0
 * @category Type IDs
 */
export const TypeId: TypeId = '~@systemfsoftware/effect-atom-react/ScopedAtom'

interface ProviderChildren {
  readonly children?: React.ReactNode | undefined
}

type ProviderProps<Input> = [Input] extends [never] ? ProviderChildren
  : ProviderChildren & { readonly value: Input }

/**
 * @since 1.0.0
 * @category models
 */
export interface ScopedAtom<A extends Atom.Atom<any>, Input = never> {
  readonly [TypeId]: TypeId
  use(): A
  Provider: React.FC<ProviderProps<Input>>
  Context: React.Context<A | undefined>
}

/**
 * @since 1.0.0
 * @category constructors
 */
const takesNoInput = <A>(factory: (() => A) | ((input: never) => A)): factory is () => A => factory.length === 0

export const make = <A extends Atom.Atom<any>, Input = never>(
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

  const Provider: React.FC<ProviderChildren | (ProviderChildren & { readonly value: Input })> = (props) => {
    const atom = React.useRef<A | null>(null)
    if (atom.current === null) {
      if ('value' in props) {
        atom.current = f(props.value)
      } else if (takesNoInput(f)) {
        atom.current = f()
      } else {
        throw new Error('ScopedAtom Provider requires a value')
      }
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
