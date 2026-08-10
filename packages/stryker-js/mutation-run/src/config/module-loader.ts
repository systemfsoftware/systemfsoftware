/**
 * Wrapper around the 'import' expression (for testability)
 * Resolves bare specifiers relative to cwd so plugins in the
 * consumer's node_modules can be found even when the importing
 * module lives at a different path in the monorepo.
 */
export function importModule(moduleName: string): Promise<unknown> {
  if (moduleName.startsWith('.') || moduleName.startsWith('/') || moduleName.startsWith('file://')) {
    return import(moduleName)
  }
  const { createRequire } = require('module') as typeof import('module')
  const req = createRequire(process.cwd() + '/noop.js')
  return import(req.resolve(moduleName))
}
