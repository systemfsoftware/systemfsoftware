import { Atom } from '@systemfsoftware/effect-atom'
import { useEffect } from 'react'

export const useHydrateAndLog = (registry: unknown, queue: readonly unknown[], log: (n: number) => void): void => {
  useEffect(() => {
    Atom.Hydration.hydrate(registry, queue)
    log(queue.length)
  }, [registry, queue, log])
}
