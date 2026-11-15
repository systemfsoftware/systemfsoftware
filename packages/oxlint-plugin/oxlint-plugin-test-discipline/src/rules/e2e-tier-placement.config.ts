import { MESSAGE } from './path.config.js'

export const OUTSIDE_TESTS_EXPECTED = 'an end-to-end test directly under the tests directory of its package' as const
export const OUTSIDE_TESTS_ACTUAL = 'an .e2e.ts file outside tests, or inside tests/__fixtures__' as const
export const OUTSIDE_TESTS_FIX = 'move it to tests/<subject>.e2e.ts in the end-to-end package' as const

export const OUTSIDE_PACKAGE_EXPECTED =
  'end-to-end tests only in a package that ships nothing: no src directory and no exports, main, module or bin' as const
export const OUTSIDE_PACKAGE_ACTUAL = 'an .e2e.ts test in a package that ships code' as const
export const OUTSIDE_PACKAGE_FIX =
  'move the test into the end-to-end package (such as apps/<product>-e2e), or, if it tests this package from inside, name it for its lane, such as .integration.test.ts' as const

export const NOT_A_FEATURE_EXPECTED = 'an end-to-end test written as a makeFeature Feature' as const
export const NOT_A_FEATURE_ACTUAL = 'an .e2e.ts file that does not import the Gherkin harness' as const
export const NOT_A_FEATURE_FIX = 'write the journey as a makeFeature Feature with Given, When and Then steps' as const

export const OTHER_TEST_EXPECTED = 'only <subject>.e2e.ts tests in an end-to-end package' as const
export const OTHER_TEST_ACTUAL = 'a .test.ts or .spec.ts file in a package that ships nothing' as const
export const OTHER_TEST_FIX =
  'write it as an end-to-end Feature named <subject>.e2e.ts, or move it into the package whose code it tests' as const

export const REACHES_SOURCE_EXPECTED =
  'an end-to-end suite that reaches the system only as it runs: through a browser, HTTP or the processes it starts' as const
export const REACHES_SOURCE_ACTUAL = 'an import of the system’s own code' as const
export const REACHES_SOURCE_FIX =
  'drive the running system instead, or move the test into the package it imports as an integration test' as const

export const REACHES_NOTHING_EXPECTED =
  'a Feature outside an end-to-end package that reaches the code of its own package or another package of this repository' as const
export const REACHES_NOTHING_ACTUAL =
  'a Feature that imports none of this repository’s code, so it can only drive the system from outside' as const
export const REACHES_NOTHING_FIX =
  'move it into the end-to-end package as <subject>.e2e.ts, or have it reach the code it is meant to test' as const

export const meta = {
  type: 'problem',
  docs: {
    description:
      'Places end-to-end tests by what they are, not by anything a package declares. An end-to-end package ships nothing (no `src` directory and no `exports`, `main`, `module` or `bin`). It holds only `tests/<subject>.e2e.ts` Features, and nothing under its `tests` reaches the system’s own code. That code is a relative import out of `tests`, a `#` subpath import, the package’s own name, an installed package linked to a directory outside every `node_modules`, or an unreadable dynamic import; local modules inside `tests` are followed. Every `.e2e.ts` file elsewhere is refused. Inversely, a Feature outside an end-to-end package that reaches none of the repository’s code is refused: it is an end-to-end test under another name.',
  },
  schema: [],
  messages: {
    e2eOutsideTests: MESSAGE,
    e2eOutsideE2ePackage: MESSAGE,
    e2eNotAFeature: MESSAGE,
    otherTestInE2ePackage: MESSAGE,
    e2eReachesSource: MESSAGE,
    featureReachesNothing: MESSAGE,
  },
} as const
