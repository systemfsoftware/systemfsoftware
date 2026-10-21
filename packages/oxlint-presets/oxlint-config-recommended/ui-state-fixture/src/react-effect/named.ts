import { useEffect } from 'react'

export const useClock = (tick: () => void): void => {
  useEffect(() => {
    const timer = setInterval(tick, 30_000)
    return () => clearInterval(timer)
  }, [tick])
}
