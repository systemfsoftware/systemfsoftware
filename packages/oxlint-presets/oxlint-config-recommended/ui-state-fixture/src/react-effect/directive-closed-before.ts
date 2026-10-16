/* oxlint-disable no-restricted-imports */
import { readFileSync } from 'node:fs'
/* oxlint-enable no-restricted-imports */
import { useEffect } from 'react'

export const read: unknown = readFileSync
export const useTicker = (tick: () => void): void => {
  useEffect(tick, [tick])
}
