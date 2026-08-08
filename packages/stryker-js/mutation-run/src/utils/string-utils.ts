import { StrykerOptions } from '@stryker-mutator/api/core'
import { propertyPath } from '@stryker-mutator/util'

export function padLeft(input: string): string {
  return input
    .split('\n')
    .map((str) => '\t' + str)
    .join('\n')
}

export function serialize(thing: unknown): string {
  return JSON.stringify(thing)
}

export function deserialize<T>(stringified: string): T {
  return JSON.parse(stringified)
}

/**
 * Print the name of (or path to) a stryker option
 */
export const optionsPath = propertyPath<StrykerOptions>()
