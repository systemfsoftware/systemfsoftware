import type { Atom } from '@systemfsoftware/effect-atom'
import { AtomReact } from '@systemfsoftware/effect-atom-react'
import { act, screen } from '@testing-library/react'
import { createElement, type ReactNode } from 'react'

type WrapperProps = { readonly children?: ReactNode }

export const withRegistry = (registry: Atom.Registry.Registry) => ({ children }: WrapperProps) =>
  createElement(AtomReact.RegistryContext.Provider, { value: registry }, children)

export const pressButton = (name: string): void => {
  act(() => {
    screen.getByRole('button', { name }).click()
  })
}
