/* oxlint-disable @systemfsoftware/effect-platform/no-react-effect */
import { useEffect } from 'react'

export const useTicker = (tick: () => void): void => {
  useEffect(tick, [tick])
}
