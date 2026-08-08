import { schema } from '@stryker-mutator/api/core'
import emojiRegex from 'emoji-regex'

const emojiRe = emojiRegex()

/**
 * The presentation-only string helpers of the clear-text reporter. They are
 * separated from the framing helpers in the engine's `worker-pool/string-utils.ts`
 * (which the child-process proxy and its worker depend on).
 */
export function plural(items: number): string {
  if (items > 1) {
    return 's'
  } else {
    return ''
  }
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
