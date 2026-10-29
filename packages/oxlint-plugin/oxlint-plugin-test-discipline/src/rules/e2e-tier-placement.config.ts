import { MESSAGE } from './path.config.js'

export const OUTSIDE_PACKAGE_EXPECTED =
  'end-to-end tests only in a package that declares the e2e role in its lint settings' as const
export const OUTSIDE_PACKAGE_ACTUAL =
  'a test registered with the effect-e2e runner in a package that declares no e2e role' as const
export const OUTSIDE_PACKAGE_FIX =
  'move the suite into an end-to-end package; if this package is one, declare the e2e role under the plugin key in its lint config settings' as const

export const INTEGRATION_IN_PACKAGE_EXPECTED = 'only end-to-end tests in a package that declares the e2e role' as const
export const INTEGRATION_IN_PACKAGE_ACTUAL = 'an integration test (Gherkin harness) in an end-to-end package' as const
export const INTEGRATION_IN_PACKAGE_FIX =
  'move the integration test into the package it covers, or write it with the runner test so it is an end-to-end test' as const

export const meta = {
  type: 'problem',
  docs: {
    description:
      "Reports an end-to-end test (a test file that value-imports `test`, or the namespace, from `@systemfsoftware/effect-e2e/runner`, whatever its name or location) in a package whose lint settings do not declare the `e2e` role; in a package that declares it, reports an integration test (a file importing the Gherkin harness and not in the e2e lane). The role is declared once in the package's own lint config settings under the plugin's key, and no rule takes a role option.",
  },
  schema: [],
  messages: {
    e2eOutsideE2ePackage: MESSAGE,
    integrationInE2ePackage: MESSAGE,
  },
} as const
