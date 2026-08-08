import { schema, StrykerOptions } from '@stryker-mutator/api/core'
import { propertyPath } from '@stryker-mutator/util'
import emojiRegex from 'emoji-regex'

const emojiRe = emojiRegex()

export function padLeft(input: string): string {
  return input
    .split('\n')
    .map((str) => '\t' + str)
    .join('\n')
}

export function plural(items: number): string {
  if (items > 1) {
    return 's'
  } else {
    return ''
  }
}

export function serialize(thing: unknown): string {
  return JSON.stringify(thing)
}

export function deserialize<T>(stringified: string): T {
  return JSON.parse(stringified)
}

export function getEmojiForStatus(status: schema.MutantStatus): string {
  switch (status) {
    case 'Killed':
      return '✅'
    case 'NoCoverage':
      return '🙈'
    case 'Ignored':
      return '🤥'
    case 'Survived':
      return '👽'
    case 'Timeout':
      return '⏰'
    case 'Pending':
      return '⌛'
    case 'RuntimeError':
    case 'CompileError':
      return '💥'
  }
}

export function stringWidth(input: string): number {
  let { length } = input
  for (const match of input.matchAll(emojiRe)) {
    length = length - match[0].length + 2
  }
  return length
}

/**
 * Print the name of (or path to) a stryker option
 */
export const optionsPath = propertyPath<StrykerOptions>()
