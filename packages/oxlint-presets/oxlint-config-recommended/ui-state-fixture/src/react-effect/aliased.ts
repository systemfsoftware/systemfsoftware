import { useEffect as afterCommit } from 'react'

export const usePersist = (key: string, value: string): void => {
  afterCommit(() => {
    globalThis.localStorage.setItem(key, value)
  }, [key, value])
}
