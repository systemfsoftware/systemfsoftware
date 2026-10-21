import { useEffectEvent } from 'react'

export const useLatest = (f: () => void): () => void => useEffectEvent(f)
