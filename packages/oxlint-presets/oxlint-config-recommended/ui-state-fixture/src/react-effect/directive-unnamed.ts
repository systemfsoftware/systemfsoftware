import { useEffect } from 'react'

export const useTicker = (tick: () => void): void => {
  // oxlint-disable-next-line
  useEffect(tick, [tick])
}
