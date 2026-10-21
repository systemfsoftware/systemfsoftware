import { useEffect } from 'react'

export const useTicker = (tick: () => void): void => {
  // eslint-disable-next-line @systemfsoftware/effect-platform/no-react-effect
  useEffect(tick, [tick])
}
