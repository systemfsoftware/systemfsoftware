export const isRecord = (input: unknown): input is Record<string, unknown> =>
  typeof input === 'object' && input !== null && !Array.isArray(input)

export const decodeRecord = (input: unknown): Record<string, unknown> => (isRecord(input) ? input : {})

export const readString = (input: Record<string, unknown>, ...keys: readonly string[]): string => {
  for (const key of keys) {
    const value = input[key]
    if (typeof value === 'string' && value.length > 0) return value
  }
  return ''
}
