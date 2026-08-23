import { type StrykerOptions } from '@systemfsoftware/stryker-js-plugin-api/core'
import { propertyPath } from '@systemfsoftware/stryker-js-util'

/**
 * Print the name of (or path to) a stryker option
 */
export const optionsPath = propertyPath<StrykerOptions>()
