/**
 * A tsdown `exports.customExports` hook that pins the root entry's `types`
 * condition to `./dist/index.d.ts` and keeps `default` last, as Node and
 * TypeScript resolve conditions in order.
 *
 * tsdown's loader imports it at config-load time, from the consumer's
 * node_modules once installed, so it stays plain JavaScript with its types in
 * `inject-types.d.ts`, and it imports nothing.
 *
 * @type {typeof import('./inject-types.js').injectTypes}
 */
export const injectTypes = (exports) => {
  const entry = exports['.']
  if (typeof entry === 'string') {
    exports['.'] = { types: './dist/index.d.ts', default: entry }
  } else if (typeof entry === 'object' && Boolean(entry)) {
    const { default: defaultEntry, types: _existingTypes, ...rest } = entry
    const withDefault = typeof defaultEntry === 'string' ? { default: defaultEntry } : {}
    exports['.'] = { ...rest, types: './dist/index.d.ts', ...withDefault }
  }
  return exports
}
