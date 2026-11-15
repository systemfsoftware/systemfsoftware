import { MESSAGE } from './path.config.js'

export const OUTSIDE_TESTS_EXPECTED = 'an end-to-end test directly under the tests directory of its package' as const
export const OUTSIDE_TESTS_ACTUAL = 'an .e2e.ts file outside tests, or inside tests/__fixtures__' as const
export const OUTSIDE_TESTS_FIX = 'tests/<subject>.e2e.ts' as const

export const OUTSIDE_PACKAGE_EXPECTED =
  'end-to-end tests only in a package that ships nothing: no src directory and no exports, main, module or bin' as const
export const OUTSIDE_PACKAGE_ACTUAL = 'an end-to-end Feature in a package that ships code' as const
export const OUTSIDE_PACKAGE_FIX = 'apps/<product>-e2e/tests/<subject>.e2e.ts' as const

export const TYPE_REACH_EXPECTED =
  'an end-to-end Feature that names nothing of the repository’s code, types included' as const
export const TYPE_REACH_ACTUAL = 'a type import of the repository’s code' as const
export const TYPE_REACH_FIX =
  'delete the import type and declare the shape the test reads in tests/__fixtures__/' as const

export const meta = {
  type: 'problem',
  docs: {
    description:
      'Places end-to-end tests. A Feature is end-to-end when no value it imports, itself or through the modules it imports from its own `tests/`, is the repository’s code: a relative import out of `tests/`, a `#` subpath import, the package’s own name, an import that resolves to no package installed from a registry, or a dynamic import whose target cannot be read. Such a Feature lives in `tests/<subject>.e2e.ts` of a package that ships nothing (no `src/` directory and no `exports`, `main`, `module` or `bin`), and names none of the repository’s code even as a type. An `.e2e.ts` file outside `tests/`, or inside `tests/__fixtures__/`, is reported.',
  },
  schema: [],
  messages: {
    e2eOutsideTests: MESSAGE,
    e2eOutsideE2ePackage: MESSAGE,
    e2eReachesSource: MESSAGE,
  },
} as const
