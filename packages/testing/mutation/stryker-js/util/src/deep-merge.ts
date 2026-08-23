export type DeepPartial<T> = {
  [P in keyof T]?: T[P] extends Record<string, unknown> ? DeepPartial<T[P]> : T[P]
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/**
 * @param defaults
 * @param overrides
 */
export function deepMerge<T extends Record<string, unknown>>(defaults: T, overrides: DeepPartial<T>): void {
  Object.keys(overrides)
    .filter((key) => key !== '__proto__')
    .forEach((key) => {
      const defaultValue: unknown = (defaults as Record<string, unknown>)[key]
      const overrideValue: unknown = (overrides as Record<string, unknown>)[key]
      if (overrideValue !== undefined) {
        if (
          defaultValue === undefined ||
          typeof defaultValue !== 'object' ||
          typeof overrideValue !== 'object' ||
          Array.isArray(defaultValue)
        ) {
          ;(defaults as Record<string, unknown>)[key] = overrideValue
        } else if (isRecord(defaultValue) && isRecord(overrideValue)) {
          deepMerge(defaultValue, overrideValue)
        } else {
          ;(defaults as Record<string, unknown>)[key] = overrideValue
        }
      }
    })
}
