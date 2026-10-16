import { useInsertionEffect } from 'react'

export const useStyle = (inject: () => void): void => {
  useInsertionEffect(inject, [inject])
}
