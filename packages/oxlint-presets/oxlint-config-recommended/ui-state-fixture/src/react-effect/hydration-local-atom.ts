import { useEffect } from 'react'
import { Atom } from './local-atom.js'

export const useHydrateAfterCommit = (registry: unknown, queue: readonly unknown[]): void => {
  useEffect(() => {
    Atom.Hydration.hydrate(registry, queue)
  }, [registry, queue])
}
