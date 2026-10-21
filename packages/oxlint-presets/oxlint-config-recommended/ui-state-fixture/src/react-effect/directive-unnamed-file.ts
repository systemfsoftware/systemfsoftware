/* eslint-disable */
import { useEffect } from 'react'

export const useTicker = (tick: () => void): void => {
  useEffect(tick, [tick])
}
