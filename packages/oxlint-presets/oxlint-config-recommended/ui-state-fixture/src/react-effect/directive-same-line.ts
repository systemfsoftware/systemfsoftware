export const useTicker = (tick: () => void): void => useEffect(tick, [tick]) // oxlint-disable-line @systemfsoftware/effect-platform/no-react-effect
import { useEffect } from 'react'
