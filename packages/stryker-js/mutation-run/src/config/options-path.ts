import { StrykerOptions } from '@stryker-mutator/api/core'
import { propertyPath } from '@stryker-mutator/util'

/**
 * Print the name of (or path to) a stryker option
 */
export const optionsPath = propertyPath<StrykerOptions>()
