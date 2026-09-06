export const isModeNone = <L extends { readonly mode: string }>(
  lock: L,
): lock is Extract<L, { readonly mode: 'none' }> => lock.mode === 'none'
