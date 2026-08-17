import * as S from 'effect/Schema'

type VitestNodeModule = typeof import('vitest/node')

/**
 * The dynamically imported project-local `vitest/node` module. The runtime
 * check only asserts object-likeness: the module namespace is whatever the
 * resolved package exports, and the consumers tolerate a missing
 * `createVitest` via their own fallbacks.
 */
export const VitestNodeModuleSchema = S.declare(
  (input: unknown): input is VitestNodeModule => input !== null && typeof input === 'object' && !Array.isArray(input),
  { description: 'The project-local vitest/node module' },
)

/** The `package.json` document of a resolved vitest package. */
export const VitestPackageSchema = S.Struct({ version: S.String })
