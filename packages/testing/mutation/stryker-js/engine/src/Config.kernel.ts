export function mergeRecords(
  base: object,
  overrides: object,
): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  Object.assign(out, base)
  for (const [key, overrideValueAny] of Object.entries(overrides)) {
    const overrideValue: unknown = overrideValueAny
    if (key === '__proto__') continue
    if (overrideValue === undefined) continue
    const baseValue: unknown = out[key]
    if (
      baseValue === undefined ||
      typeof baseValue !== 'object' ||
      typeof overrideValue !== 'object' ||
      baseValue === null ||
      overrideValue === null ||
      Array.isArray(baseValue) ||
      Array.isArray(overrideValue)
    ) {
      out[key] = overrideValue
    } else {
      const merged = mergeRecords(baseValue, overrideValue)
      out[key] = merged
    }
  }
  return out
}
