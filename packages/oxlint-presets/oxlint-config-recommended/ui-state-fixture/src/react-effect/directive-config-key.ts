import { useEffect } from 'react'

export const useTicker = (tick: () => void): void => {
  // oxlint-disable-next-line @systemfsoftware/oxlint-plugin-effect-platform/no-react-effect
  useEffect(tick, [tick])
}
