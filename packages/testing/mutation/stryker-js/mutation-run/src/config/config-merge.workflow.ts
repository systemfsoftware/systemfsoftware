/**
 * Pure record merge for config documents.
 *
 * Merge is associative, right-biased on scalar collision, and recursive on
 * plain objects. Arrays and non-records are replaced wholesale (right wins).
 * `null` handling and `plugins` deduplication are in `extends-step.ts:mergeConfigs`,
 * which adds config-specific rules on top. This file is the generic associative
 * merge the property test covers.
 *
 * Values are `unknown` after `ConfigDocumentSchema` decoding at the read
 * boundary; no `as` casts are used and `isErrnoException` is the guard for
 * errno shapes elsewhere.
 */

export function mergeRecords(
  base: object,
  overrides: object,
): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  for (const key of Object.keys(base)) {
    Reflect.set(out, key, Reflect.get(base, key))
  }
  for (const key of Object.keys(overrides)) {
    if (key === '__proto__') continue
    const overrideValue: unknown = Reflect.get(overrides, key)
    if (overrideValue === undefined) continue
    const baseValue: unknown = Reflect.get(base, key)
    if (
      baseValue === undefined ||
      typeof baseValue !== 'object' ||
      typeof overrideValue !== 'object' ||
      baseValue === null ||
      overrideValue === null ||
      Array.isArray(baseValue) ||
      Array.isArray(overrideValue)
    ) {
      Reflect.set(out, key, overrideValue)
    } else {
      const merged = mergeRecords(baseValue, overrideValue)
      Reflect.set(out, key, merged)
    }
  }
  return out
}
