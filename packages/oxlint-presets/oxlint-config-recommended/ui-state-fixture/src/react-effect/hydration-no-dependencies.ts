import { Atom } from '@systemfsoftware/effect-atom'
import { useEffect } from 'react'

export const useHydrateEveryRender = (registry: unknown, queue: readonly unknown[]): void => {
  useEffect(() => {
    Atom.Hydration.hydrate(registry, queue)
  })
}
