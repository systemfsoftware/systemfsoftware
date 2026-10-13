import { useMemo, useSyncExternalStore } from 'react'

export const useReading = (subscribe: (onChange: () => void) => () => void, read: () => number): number => {
  const stableSubscribe = useMemo(() => subscribe, [subscribe])
  return useSyncExternalStore(stableSubscribe, read, read)
}
