/**
 * Calls a defined callback function on each element of a map, and returns an array that contains the results.
 *
 * @param subject The map to act on
 * @param callbackFn The callback fn
 * @returns
 */
export function map<K, V, R>(
  subject: Map<K, V>,
  callbackFn: (value: V, key: K) => R,
): R[] {
  const results: R[] = []
  subject.forEach((value, key) => results.push(callbackFn(value, key)))
  return results
}
