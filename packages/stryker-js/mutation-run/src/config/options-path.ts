import { propertyPath } from '@stryker-mutator/util'
import { type StrykerOptions } from '@systemfsoftware/stryker-js-plugin-api/core'

/**
 * Print the name of (or path to) a stryker option
 */
export const optionsPath = propertyPath<StrykerOptions>()
