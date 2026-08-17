import { StrykerOptionsSchema } from '@systemfsoftware/stryker-js-plugin-api/core'

/**
 * The core options schema is itself an open struct: unknown keys — including
 * the plugin's own `typescriptChecker` option — pass through the rest-record
 * and stay on the decoded options, matching how the real stryker validator
 * keeps plugin-specific keys.
 */
export { StrykerOptionsSchema as CheckerOptionsWithPluginKeys }
