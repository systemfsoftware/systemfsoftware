import { useLayoutEffect } from 'react'

export const useMeasure = (measure: () => void): void => {
  useLayoutEffect(measure, [measure])
}
