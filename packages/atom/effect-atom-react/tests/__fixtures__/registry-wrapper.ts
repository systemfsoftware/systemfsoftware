import type { Atom } from '@systemfsoftware/effect-atom'
import { AtomReact } from '@systemfsoftware/effect-atom-react'
import { act, screen } from '@testing-library/react'
import { createElement, type ReactNode, StrictMode } from 'react'

type WrapperProps = { readonly children?: ReactNode }

export const withRegistry = (registry: Atom.Registry.Registry) => ({ children }: WrapperProps) =>
  createElement(AtomReact.RegistryContext.Provider, { value: registry }, children)

export const withRegistryProvider = ({ children }: WrapperProps) =>
  createElement(AtomReact.RegistryProvider, null, children)

export const withStrictRegistryProvider = ({ children }: WrapperProps) =>
  createElement(StrictMode, null, createElement(AtomReact.RegistryProvider, null, children))

export const pressButton = (name: string): void => {
  act(() => {
    screen.getByRole('button', { name }).click()
  })
}
