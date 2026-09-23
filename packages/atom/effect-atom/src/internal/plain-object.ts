/**
 * Shape predicates for option objects, shared by the modules that give
 * exports a pipeable, dual-dispatched form. Everything here is internal:
 * the module is not a package entry point.
 *
 * @since 4.0.0
 */

/** @internal */
export const isNonNullObject = (value: unknown): value is object => {
  if (typeof value !== 'object') {
    return false
  }
  return value !== null
}

/** @internal */
export const hasPlainProto = (value: object): boolean =>
  Reflect.getPrototypeOf(value) === Object.prototype || Reflect.getPrototypeOf(value) === null

/** @internal */
export const isPlainObject = (value: unknown): value is object => {
  return isNonNullObject(value) && hasPlainProto(value)
}

const hasOnlyKeys = (value: object, keys: readonly string[]): boolean =>
  Object.keys(value).every((key) => keys.includes(key))

/** @internal */
export const isPlainOptions = (
  keys: readonly string[],
): (value: unknown) => value is object =>
(value): value is object => isPlainObject(value) && hasOnlyKeys(value, keys)
